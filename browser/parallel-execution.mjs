import { randomBytes, createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync
} from 'node:fs';
import path from 'node:path';

const MAX_WORKERS = 15;
const MAX_LABEL = 80;
const MAX_TITLE = 120;
const MAX_OBJECTIVE = 2000;
const MAX_ROLE = 80;
const MAX_CAPABILITIES = 12;
const MAX_RESOURCE_KEY = 180;
const MIN_LEASE_MS = 1000;
const MAX_LEASE_MS = 60000;
const MAX_ARTIFACT_BYTES = 20000;
const HEX_ID = /^[a-f0-9]{32}$/;
const safeNow = () => Date.now();
const makeId = () => randomBytes(16).toString('hex');
const ownerHash = owner => createHash('sha256').update(String(owner)).digest('hex');
const fingerprint = owner => ownerHash(owner).slice(0, 12);

function spec(name, description, properties = {}, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false
    },
    securitySchemes: [{ type: 'oauth2', scopes: ['browser:control'] }]
  };
}

const idField = { type: 'string', pattern: '^[a-f0-9]{32}$', minLength: 32, maxLength: 32 };
const contextField = { contextId: idField };
const taskField = { taskId: idField };
const workerField = { workerId: idField };

export const parallelToolSpecs = {
  browser_context_create: spec(
    'browser_context_create',
    'Cria um contexto de trabalho isolado para uma conversa. O contextId deve ser reutilizado nas próximas chamadas desta conversa; não representa, por si só, um perfil Chrome/cookie separado.',
    { label: { type: 'string', maxLength: MAX_LABEL } }
  ),
  browser_context_status: spec(
    'browser_context_status',
    'Consulta o contexto privado da conversa e suas tarefas.',
    contextField,
    ['contextId']
  ),
  browser_context_close: spec(
    'browser_context_close',
    'Encerra o contexto, cancela tarefas abertas e libera todos os locks associados. Não fecha abas físicas do Chrome.',
    contextField,
    ['contextId']
  ),
  browser_context_attach_tabs: spec(
    'browser_context_attach_tabs',
    'Associa abas existentes do Chrome a um contexto de conversa. Uma aba não pode pertencer a dois contextos do mesmo proprietário.',
    { ...contextField, tabIds: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 30 } },
    ['contextId', 'tabIds']
  ),
  browser_context_detach_tabs: spec(
    'browser_context_detach_tabs',
    'Desassocia abas de um contexto sem fechá-las no Chrome.',
    { ...contextField, tabIds: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 30 } },
    ['contextId', 'tabIds']
  ),
  browser_context_tabs: spec(
    'browser_context_tabs',
    'Lista as abas que pertencem a um contexto.',
    contextField,
    ['contextId']
  ),
  browser_task_create: spec(
    'browser_task_create',
    'Cria uma tarefa compartilhada dentro de um contexto, com até 15 slots de worker. O servidor coordena workers; não instancia modelos de IA.',
    {
      ...contextField,
      title: { type: 'string', maxLength: MAX_TITLE },
      objective: { type: 'string', maxLength: MAX_OBJECTIVE },
      maxWorkers: { type: 'number' }
    },
    ['contextId', 'title', 'objective']
  ),
  browser_task_join: spec(
    'browser_task_join',
    'Permite que outra conversa, com seu próprio contextId, participe da mesma tarefa compartilhada sem compartilhar abas ou contexto de navegador.',
    { ...contextField, ...taskField },
    ['contextId', 'taskId']
  ),
  browser_worker_register: spec(
    'browser_worker_register',
    'Registra um worker externo na tarefa compartilhada. Workers podem colaborar nos mesmos artefatos, mas precisam usar locks para escrita.',
    {
      ...contextField,
      ...taskField,
      role: { type: 'string', maxLength: MAX_ROLE },
      capabilities: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: MAX_CAPABILITIES }
    },
    ['contextId', 'taskId', 'role']
  ),
  browser_worker_heartbeat: spec(
    'browser_worker_heartbeat',
    'Atualiza a atividade de um worker registrado.',
    { ...contextField, ...taskField, ...workerField },
    ['contextId', 'taskId', 'workerId']
  ),
  browser_worker_complete: spec(
    'browser_worker_complete',
    'Marca um worker como concluído, falho ou cancelado e libera seus locks.',
    {
      ...contextField,
      ...taskField,
      ...workerField,
      status: { type: 'string', enum: ['completed', 'failed', 'cancelled'] },
      summary: { type: 'string', maxLength: 1200 }
    },
    ['contextId', 'taskId', 'workerId', 'status']
  ),
  browser_resource_claim: spec(
    'browser_resource_claim',
    'Adquire imediatamente um lock de leitura ou escrita. Não existe fila: colisões retornam RESOURCE_BUSY para o coordenador redistribuir o trabalho.',
    {
      ...contextField,
      ...taskField,
      ...workerField,
      resourceKey: { type: 'string', minLength: 1, maxLength: MAX_RESOURCE_KEY },
      mode: { type: 'string', enum: ['read', 'write'] },
      leaseMs: { type: 'number' }
    },
    ['contextId', 'taskId', 'workerId', 'resourceKey', 'mode']
  ),
  browser_resource_release: spec(
    'browser_resource_release',
    'Libera um lock pertencente ao worker. A liberação exige o lockId retornado na aquisição.',
    {
      ...contextField,
      ...taskField,
      ...workerField,
      resourceKey: { type: 'string', minLength: 1, maxLength: MAX_RESOURCE_KEY },
      lockId: idField
    },
    ['contextId', 'taskId', 'workerId', 'resourceKey', 'lockId']
  ),
  browser_artifact_publish: spec(
    'browser_artifact_publish',
    'Publica uma versão de um artefato compartilhado. Exige lock de escrita artifact:<key> e expectedVersion para impedir sobrescrita silenciosa.',
    {
      ...contextField,
      ...taskField,
      ...workerField,
      key: { type: 'string', minLength: 1, maxLength: 100 },
      content: { type: 'string', maxLength: MAX_ARTIFACT_BYTES },
      expectedVersion: { type: 'number' }
    },
    ['contextId', 'taskId', 'workerId', 'key', 'content', 'expectedVersion']
  ),
  browser_artifact_read: spec(
    'browser_artifact_read',
    'Lê o conteúdo e a versão atual de um artefato compartilhado da tarefa.',
    {
      ...contextField,
      ...taskField,
      key: { type: 'string', minLength: 1, maxLength: 100 }
    },
    ['contextId', 'taskId', 'key']
  ),
  browser_task_status: spec(
    'browser_task_status',
    'Consulta workers, artefatos e locks ativos de uma tarefa.',
    { ...contextField, ...taskField },
    ['contextId', 'taskId']
  ),
  browser_task_cancel: spec(
    'browser_task_cancel',
    'Cancela uma tarefa compartilhada e libera imediatamente seus locks.',
    {
      ...contextField,
      ...taskField,
      reason: { type: 'string', maxLength: 240 }
    },
    ['contextId', 'taskId']
  )
};

const defaultState = () => ({
  version: 1,
  contexts: {},
  tasks: {},
  audit: []
});

function result(value, isError = false) {
  return {
    isError,
    content: [{ type: 'text', text: JSON.stringify(value) }]
  };
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ARGUMENTS');
}

function assertId(value, name) {
  if (typeof value !== 'string' || !HEX_ID.test(value)) throw new Error(name + '_INVALID');
}

function assertString(value, name, max, min = 0) {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new Error(name + '_INVALID');
}

function assertInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + '_INVALID');
}

export function createParallelExecution(dataDir) {
  const file = path.join(dataDir, 'browser-parallel-state.json');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  let state = defaultState();
  let storageHealthy = true;

  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !parsed.contexts || !parsed.tasks || !Array.isArray(parsed.audit)) {
        throw new Error('INVALID_PARALLEL_STATE');
      }
      state = parsed;
    }
  } catch {
    storageHealthy = false;
    console.error('[browser-parallel] private state unavailable; parallel tools fail closed');
  }

  const persist = () => {
    if (!storageHealthy) throw new Error('PARALLEL_STATE_UNAVAILABLE');
    const temp = file + '.' + randomBytes(6).toString('hex') + '.tmp';
    writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    renameSync(temp, file);
  };

  const audit = (event, owner, contextId, taskId = null, workerId = null, detail = null) => {
    state.audit.push({
      at: new Date(safeNow()).toISOString(),
      event,
      owner: fingerprint(owner),
      contextId,
      taskId,
      workerId,
      detail
    });
    state.audit = state.audit.slice(-500);
  };

  const cleanupLocks = task => {
    const time = safeNow();
    for (const [resourceKey, lock] of Object.entries(task.locks || {})) {
      for (const [workerId, reader] of Object.entries(lock.readers || {})) {
        if (reader.expiresAt <= time) delete lock.readers[workerId];
      }
      if (lock.writer && lock.writer.expiresAt <= time) lock.writer = null;
      if (!lock.writer && Object.keys(lock.readers || {}).length === 0) delete task.locks[resourceKey];
    }
  };

  const contextFor = (owner, contextId) => {
    assertId(contextId, 'CONTEXT_ID');
    const context = state.contexts[contextId];
    if (!context || context.owner !== ownerHash(owner) || context.closedAt) throw new Error('CONTEXT_NOT_FOUND');
    return context;
  };

  const taskFor = (owner, contextId, taskId) => {
    assertId(taskId, 'TASK_ID');
    const context = contextFor(owner, contextId);
    const task = state.tasks[taskId];
    if (task && !Array.isArray(task.contextIds)) task.contextIds = [task.contextId].filter(Boolean);
    if (!task || !Array.isArray(task.contextIds) || !task.contextIds.includes(contextId) || task.owner !== ownerHash(owner)) {
      throw new Error('TASK_NOT_FOUND');
    }
    cleanupLocks(task);
    return { context, task };
  };

  const workerFor = (owner, contextId, taskId, workerId) => {
    assertId(workerId, 'WORKER_ID');
    const { context, task } = taskFor(owner, contextId, taskId);
    const worker = task.workers[workerId];
    if (!worker || worker.status !== 'running' || worker.contextId !== contextId) throw new Error('WORKER_NOT_ACTIVE');
    worker.lastSeen = safeNow();
    return { context, task, worker };
  };

  const releaseWorkerLocks = (task, workerId) => {
    for (const [resourceKey, lock] of Object.entries(task.locks || {})) {
      if (lock.writer?.workerId === workerId) lock.writer = null;
      if (lock.readers?.[workerId]) delete lock.readers[workerId];
      if (!lock.writer && Object.keys(lock.readers || {}).length === 0) delete task.locks[resourceKey];
    }
  };

  const claimResource = (owner, input) => {
    const { task, worker } = workerFor(owner, input.contextId, input.taskId, input.workerId);
    assertString(input.resourceKey, 'RESOURCE_KEY', MAX_RESOURCE_KEY, 1);
    if (!['read', 'write'].includes(input.mode)) throw new Error('LOCK_MODE_INVALID');
    const leaseMs = input.leaseMs === undefined ? 15000 : input.leaseMs;
    assertInteger(leaseMs, 'LEASE_MS', MIN_LEASE_MS, MAX_LEASE_MS);

    const current = task.locks[input.resourceKey] || { readers: {}, writer: null };
    const now = safeNow();
    const existingWriter = current.writer;
    const otherReaders = Object.entries(current.readers).filter(([id]) => id !== input.workerId);

    if (input.mode === 'read') {
      if (existingWriter && existingWriter.workerId !== input.workerId) {
        return { error: 'RESOURCE_BUSY', resourceKey: input.resourceKey, mode: 'read', activeWorkers: [existingWriter.workerId] };
      }
      const lockId = current.readers[input.workerId]?.lockId || makeId();
      current.readers[input.workerId] = { workerId: input.workerId, lockId, expiresAt: now + leaseMs };
      task.locks[input.resourceKey] = current;
      audit('lock_read', owner, input.contextId, input.taskId, input.workerId, input.resourceKey);
      persist();
      return { acquired: true, mode: 'read', resourceKey: input.resourceKey, lockId, expiresAt: current.readers[input.workerId].expiresAt };
    }

    if ((existingWriter && existingWriter.workerId !== input.workerId) || otherReaders.length > 0) {
      const activeWorkers = [
        ...(existingWriter ? [existingWriter.workerId] : []),
        ...otherReaders.map(([id]) => id)
      ];
      return { error: 'RESOURCE_BUSY', resourceKey: input.resourceKey, mode: 'write', activeWorkers };
    }

    const lockId = existingWriter?.lockId || makeId();
    current.readers[input.workerId] && delete current.readers[input.workerId];
    current.writer = { workerId: input.workerId, lockId, expiresAt: now + leaseMs };
    task.locks[input.resourceKey] = current;
    audit('lock_write', owner, input.contextId, input.taskId, input.workerId, input.resourceKey);
    persist();
    return { acquired: true, mode: 'write', resourceKey: input.resourceKey, lockId, expiresAt: current.writer.expiresAt };
  };

  const releaseResource = (owner, input) => {
    const { task } = workerFor(owner, input.contextId, input.taskId, input.workerId);
    assertString(input.resourceKey, 'RESOURCE_KEY', MAX_RESOURCE_KEY, 1);
    assertId(input.lockId, 'LOCK_ID');
    const lock = task.locks[input.resourceKey];
    if (!lock) throw new Error('LOCK_NOT_FOUND');
    if (lock.writer?.workerId === input.workerId && lock.writer.lockId === input.lockId) {
      lock.writer = null;
    } else if (lock.readers?.[input.workerId]?.lockId === input.lockId) {
      delete lock.readers[input.workerId];
    } else {
      throw new Error('LOCK_NOT_OWNED');
    }
    if (!lock.writer && Object.keys(lock.readers || {}).length === 0) delete task.locks[input.resourceKey];
    audit('lock_release', owner, input.contextId, input.taskId, input.workerId, input.resourceKey);
    persist();
    return { released: true, resourceKey: input.resourceKey };
  };

  const runTool = (owner, name, args = {}) => {
    try {
      if (!storageHealthy) throw new Error('PARALLEL_STATE_UNAVAILABLE');
      if (!owner) throw new Error('OAUTH_REQUIRED');
      assertObject(args);
      const who = ownerHash(owner);
      const now = safeNow();

      switch (name) {
        case 'browser_context_create': {
          const label = args.label === undefined ? 'Chat workspace' : args.label;
          assertString(label, 'LABEL', MAX_LABEL);
          const id = makeId();
          state.contexts[id] = {
            id,
            owner: who,
            label,
            createdAt: now,
            closedAt: null,
            tabIds: []
          };
          audit('context_create', owner, id, null, null, label);
          persist();
          return result({ contextId: id, label, createdAt: now, note: 'Reutilize este contextId somente nesta conversa.' });
        }
        case 'browser_context_status': {
          const context = contextFor(owner, args.contextId);
          const tasks = Object.values(state.tasks).filter(t => (t.contextIds?.includes(context.id) || t.contextId === context.id) && t.owner === who);
          return result({
            contextId: context.id,
            label: context.label,
            closed: false,
            tabIds: context.tabIds,
            tasks: tasks.map(t => ({ taskId: t.id, title: t.title, status: t.status, maxWorkers: t.maxWorkers, workerCount: Object.keys(t.workers).length }))
          });
        }
        case 'browser_context_close': {
          const context = contextFor(owner, args.contextId);
          const tasks = Object.values(state.tasks).filter(t => (t.contextIds?.includes(context.id) || t.contextId === context.id) && t.owner === who && t.status === 'running');
          let cancelledTasks = 0;
          for (const task of tasks) {
            if (!Array.isArray(task.contextIds)) task.contextIds = [task.contextId].filter(Boolean);
            task.contextIds = task.contextIds.filter(id => id !== context.id);
            for (const worker of Object.values(task.workers)) {
              if (worker.contextId === context.id && worker.status === 'running') {
                worker.status = 'cancelled'; worker.completedAt = now; releaseWorkerLocks(task, worker.id);
              }
            }
            if (task.contextIds.length === 0) {
              task.status = 'cancelled'; task.cancelledAt = now; task.cancelReason = 'LAST_CONTEXT_CLOSED'; task.locks = {}; cancelledTasks++;
              for (const worker of Object.values(task.workers)) if (worker.status === 'running') { worker.status = 'cancelled'; worker.completedAt = now; }
            }
          }
          context.closedAt = now;
          context.tabIds = [];
          audit('context_close', owner, context.id);
          persist();
          return result({ closed: true, contextId: context.id, detachedTasks: tasks.length, cancelledTasks, browserTabsClosed: false });
        }
        case 'browser_context_attach_tabs': {
          const context = contextFor(owner, args.contextId);
          if (!Array.isArray(args.tabIds) || args.tabIds.length < 1 || args.tabIds.length > 30 ||
              args.tabIds.some(id => !Number.isSafeInteger(id) || id < 0) || new Set(args.tabIds).size !== args.tabIds.length) {
            throw new Error('TAB_IDS_INVALID');
          }
          for (const other of Object.values(state.contexts)) {
            if (other.owner !== who || other.closedAt || other.id === context.id) continue;
            const conflict = args.tabIds.find(id => other.tabIds.includes(id));
            if (conflict !== undefined) throw new Error('TAB_ALREADY_OWNED_BY_ANOTHER_CONTEXT');
          }
          context.tabIds = [...new Set([...context.tabIds, ...args.tabIds])];
          audit('context_attach_tabs', owner, context.id, null, null, String(args.tabIds.length));
          persist();
          return result({ contextId: context.id, attachedTabIds: args.tabIds, tabIds: context.tabIds });
        }
        case 'browser_context_detach_tabs': {
          const context = contextFor(owner, args.contextId);
          if (!Array.isArray(args.tabIds) || args.tabIds.length < 1 || args.tabIds.length > 30 ||
              args.tabIds.some(id => !Number.isSafeInteger(id) || id < 0)) throw new Error('TAB_IDS_INVALID');
          context.tabIds = context.tabIds.filter(id => !args.tabIds.includes(id));
          audit('context_detach_tabs', owner, context.id, null, null, String(args.tabIds.length));
          persist();
          return result({ contextId: context.id, tabIds: context.tabIds });
        }
        case 'browser_context_tabs': {
          const context = contextFor(owner, args.contextId);
          return result({ contextId: context.id, tabIds: context.tabIds });
        }
        case 'browser_task_create': {
          const context = contextFor(owner, args.contextId);
          assertString(args.title, 'TITLE', MAX_TITLE, 1);
          assertString(args.objective, 'OBJECTIVE', MAX_OBJECTIVE, 1);
          const maxWorkers = args.maxWorkers === undefined ? MAX_WORKERS : args.maxWorkers;
          assertInteger(maxWorkers, 'MAX_WORKERS', 1, MAX_WORKERS);
          const id = makeId();
          state.tasks[id] = {
            id,
            contextId: context.id,
            contextIds: [context.id],
            owner: who,
            title: args.title,
            objective: args.objective,
            maxWorkers,
            status: 'running',
            createdAt: now,
            completedAt: null,
            cancelledAt: null,
            cancelReason: null,
            workers: {},
            locks: {},
            artifacts: {}
          };
          audit('task_create', owner, context.id, id, null, String(maxWorkers));
          persist();
          return result({ taskId: id, contextId: context.id, title: args.title, maxWorkers, status: 'running' });
        }
        case 'browser_task_join': {
          const context = contextFor(owner, args.contextId);
          assertId(args.taskId, 'TASK_ID');
          const task = state.tasks[args.taskId];
          if (!task || task.owner !== who || task.status !== 'running') throw new Error('TASK_NOT_JOINABLE');
          if (!Array.isArray(task.contextIds)) task.contextIds = [task.contextId].filter(Boolean);
          const alreadyJoined = task.contextIds.includes(context.id);
          if (!alreadyJoined) task.contextIds.push(context.id);
          audit('task_join', owner, context.id, task.id);
          persist();
          return result({ joined: true, alreadyJoined, contextId: context.id, taskId: task.id, maxWorkers: task.maxWorkers, activeWorkers: Object.values(task.workers).filter(w => w.status === 'running').length });
        }
        case 'browser_worker_register': {
          const { task } = taskFor(owner, args.contextId, args.taskId);
          if (task.status !== 'running') throw new Error('TASK_NOT_RUNNING');
          assertString(args.role, 'ROLE', MAX_ROLE, 1);
          const capabilities = args.capabilities === undefined ? [] : args.capabilities;
          if (!Array.isArray(capabilities) || capabilities.length > MAX_CAPABILITIES ||
              capabilities.some(x => typeof x !== 'string' || x.length > 80)) throw new Error('CAPABILITIES_INVALID');
          const active = Object.values(task.workers).filter(w => w.status === 'running');
          if (active.length >= task.maxWorkers) throw new Error('WORKER_LIMIT_REACHED');
          const workerId = makeId();
          task.workers[workerId] = {
            id: workerId,
            contextId: args.contextId,
            role: args.role,
            capabilities,
            status: 'running',
            registeredAt: now,
            lastSeen: now,
            completedAt: null,
            summary: null
          };
          audit('worker_register', owner, args.contextId, args.taskId, workerId, args.role);
          persist();
          return result({ workerId, laneId: workerId, taskId: task.id, role: args.role, status: 'running', activeWorkers: active.length + 1, maxWorkers: task.maxWorkers });
        }
        case 'browser_worker_heartbeat': {
          const { worker } = workerFor(owner, args.contextId, args.taskId, args.workerId);
          worker.lastSeen = now;
          persist();
          return result({ workerId: worker.id, status: worker.status, lastSeen: now });
        }
        case 'browser_worker_complete': {
          const { task, worker } = workerFor(owner, args.contextId, args.taskId, args.workerId);
          if (!['completed', 'failed', 'cancelled'].includes(args.status)) throw new Error('WORKER_STATUS_INVALID');
          const summary = args.summary === undefined ? '' : args.summary;
          assertString(summary, 'SUMMARY', 1200);
          worker.status = args.status;
          worker.summary = summary;
          worker.completedAt = now;
          releaseWorkerLocks(task, worker.id);
          audit('worker_complete', owner, args.contextId, args.taskId, worker.id, args.status);
          if (Object.values(task.workers).length > 0 && Object.values(task.workers).every(w => w.status !== 'running')) {
            task.status = 'completed';
            task.completedAt = now;
          }
          persist();
          return result({ workerId: worker.id, status: worker.status, taskStatus: task.status });
        }
        case 'browser_resource_claim': {
          const claimed = claimResource(owner, args);
          if (claimed.error) return result(claimed, true);
          return result(claimed);
        }
        case 'browser_resource_release': {
          return result(releaseResource(owner, args));
        }
        case 'browser_artifact_publish': {
          const { task } = workerFor(owner, args.contextId, args.taskId, args.workerId);
          assertString(args.key, 'ARTIFACT_KEY', 100, 1);
          assertString(args.content, 'ARTIFACT_CONTENT', MAX_ARTIFACT_BYTES);
          assertInteger(args.expectedVersion, 'EXPECTED_VERSION', 0, Number.MAX_SAFE_INTEGER);
          const lock = task.locks['artifact:' + args.key];
          cleanupLocks(task);
          if (!lock?.writer || lock.writer.workerId !== args.workerId || lock.writer.expiresAt <= now) {
            throw new Error('ARTIFACT_WRITE_LOCK_REQUIRED');
          }
          const existing = task.artifacts[args.key];
          const currentVersion = existing?.version || 0;
          if (currentVersion !== args.expectedVersion) {
            return result({ error: 'VERSION_CONFLICT', key: args.key, expectedVersion: args.expectedVersion, currentVersion }, true);
          }
          const nextVersion = currentVersion + 1;
          task.artifacts[args.key] = { version: nextVersion, content: args.content, updatedAt: now, updatedBy: args.workerId };
          audit('artifact_publish', owner, args.contextId, args.taskId, args.workerId, args.key);
          persist();
          return result({ published: true, key: args.key, version: nextVersion });
        }
        case 'browser_artifact_read': {
          const { task } = taskFor(owner, args.contextId, args.taskId);
          assertString(args.key, 'ARTIFACT_KEY', 100, 1);
          const artifact = task.artifacts[args.key];
          return result(artifact ? { key: args.key, version: artifact.version, content: artifact.content, updatedAt: artifact.updatedAt } : { key: args.key, version: 0, content: null });
        }
        case 'browser_task_status': {
          const { task } = taskFor(owner, args.contextId, args.taskId);
          cleanupLocks(task);
          return result({
            taskId: task.id,
            contextId: task.contextId,
            title: task.title,
            objective: task.objective,
            status: task.status,
            maxWorkers: task.maxWorkers,
            workers: Object.values(task.workers).map(w => ({ workerId: w.id, laneId: w.id, contextId: w.contextId, role: w.role, capabilities: w.capabilities, status: w.status, lastSeen: w.lastSeen, summary: w.summary })),
            artifacts: Object.entries(task.artifacts).map(([key, artifact]) => ({ key, version: artifact.version, updatedAt: artifact.updatedAt })),
            locks: Object.entries(task.locks).map(([resourceKey, lock]) => ({ resourceKey, readers: Object.keys(lock.readers || {}), writer: lock.writer?.workerId || null }))
          });
        }
        case 'browser_task_cancel': {
          const { task } = taskFor(owner, args.contextId, args.taskId);
          if (task.status !== 'running') throw new Error('TASK_NOT_RUNNING');
          const reason = args.reason === undefined ? 'CANCELLED_BY_OWNER' : args.reason;
          assertString(reason, 'REASON', 240);
          task.status = 'cancelled';
          task.cancelledAt = now;
          task.cancelReason = reason;
          task.locks = {};
          for (const worker of Object.values(task.workers)) if (worker.status === 'running') worker.status = 'cancelled';
          audit('task_cancel', owner, args.contextId, args.taskId, null, reason);
          persist();
          return result({ cancelled: true, taskId: task.id, releasedLocks: true });
        }
        default:
          return result({ error: 'UNKNOWN_PARALLEL_TOOL' }, true);
      }
    } catch (error) {
      return result({ error: String(error?.message || error).slice(0, 120) }, true);
    }
  };

  const listActiveLanes = owner => {
    const who = ownerHash(owner);
    return Object.values(state.tasks)
      .filter(task => task.owner === who && task.status === 'running')
      .flatMap(task => Object.values(task.workers)
        .filter(worker => worker.status === 'running')
        .map(worker => worker.id));
  };

  const isActiveLane = (owner, laneId) => {
    if (typeof laneId !== 'string' || !HEX_ID.test(laneId)) return false;
    const who = ownerHash(owner);
    return Object.values(state.tasks).some(task =>
      task.owner === who && task.status === 'running' &&
      task.workers[laneId]?.status === 'running'
    );
  };

  return {
    toolSpecs: parallelToolSpecs,
    runTool,
    claimResource,
    releaseResource,
    listActiveLanes,
    isActiveLane,
    getStateForTest: () => JSON.parse(JSON.stringify(state))
  };
}
