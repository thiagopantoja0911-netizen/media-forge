// Stateful cancellation. Cancelling never deletes project files, logs or MP4s.
// The active renderer is interrupted only by a worker holding the matching lease.
export function requestCancellation(job,now=new Date().toISOString()){
  if(!job)throw Object.assign(new Error("JOB_NOT_FOUND"),{status:404});
  if(["completed","failed","cancelled"].includes(job.status))
    return {job,changed:false};
  if(job.status==="queued" || (job.status==="processing"&&
      (!job.workerLease || Date.parse(job.workerLease.expiresAt)<=Date.parse(now)))){
    job.status="cancelled";
    job.phase="cancelled";
    job.cancelRequestedAt=job.cancelRequestedAt||now;
    job.cancelledAt=now;
    job.progressMessage="Cancelado antes de iniciar ou apos desconexao";
    delete job.workerLease;
    job.updatedAt=now;
    return {job,changed:true};
  }
  if(job.status==="processing"){
    if(job.cancelRequestedAt)return {job,changed:false};
    job.cancelRequestedAt=now;
    job.phase="cancelling";
    job.progressMessage="Cancelamento solicitado; aguardando confirmacao do Windows";
    job.updatedAt=now;
    return {job,changed:true};
  }
  throw Object.assign(new Error("JOB_NOT_CANCELLABLE"),{status:409});
}
export function acknowledgeCancellation(job,now=new Date().toISOString()){
  if(job?.status!=="processing"||!job.cancelRequestedAt)return false;
  job.status="cancelled";
  job.phase="cancelled";
  job.progressMessage="Render cancelado pelo usuario";
  job.cancelledAt=now;
  job.updatedAt=now;
  delete job.workerLease;
  return true;
}
// Leases that expire while another render is active are reconciled during
// heartbeat. A recently lost worker must not be able to upload or finish a job.
export function reconcileExpiredLease(job,now=new Date().toISOString()){
  if(!job||job.status!=="processing"||!job.workerLease)return false;
  const expires=Date.parse(job.workerLease.expiresAt);
  if(!Number.isFinite(expires)||expires>Date.parse(now))return false;
  if(job.cancelRequestedAt){
    acknowledgeCancellation(job,now);
    return true;
  }
  if((job.attempts||0)>=3){
    job.status="failed";
    job.phase="failed";
    job.error={code:"WORKER_TIMEOUT",message:"Worker lease expired after retries"};
  }else{
    job.status="queued";
    job.phase="queued";
    job.progress=0;
    job.progressMessage="Worker desconectado; trabalho aguardando nova tentativa";
  }
  // Old frame reports cannot be reused to mark a different attempt as advancing.
  delete job.workerLease;
  delete job.renderTelemetry;
  job.updatedAt=now;
  return true;
}
export function cancellationRequested(job,leaseId){
  return Boolean(job?.status==="processing"&&job.cancelRequestedAt&&
    job.workerLease?.id===leaseId);
}
