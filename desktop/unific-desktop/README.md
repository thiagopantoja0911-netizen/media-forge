# Unific Desktop V1.2 — conexão segura com o Worker

## Objetivo

App Windows para usar MediaForge + Browser MCP em segundo plano, sem um ícone flutuante permanente.

- O mouse no topo da **área de trabalho do Windows** abre um painel **horizontal e fixo**, com abas Visão geral, MediaForge, Browser MCP, Diagnóstico, Assistente e Configurações.
- O painel **não se abre automaticamente sobre outras janelas**. O detector oculto do Windows usa apenas o identificador da janela em primeiro plano (sem ler conteúdos). Se a detecção não estiver disponível, o painel não se abre automaticamente.
- O painel completo é fixo, sem ser arrastável, e pode ser aberto pelo menu da bandeja ou pelo atalho `Ctrl+Alt+U`.
- A rede de conhecimento aparece como **background de nós e conexões**, também com visualização ampliada e controles em **Configurações**. Os registros persistem no perfil do Windows, e a V1 é migrada sem excluir o original.
- O assistente beta responde sobre diagnósticos e temas de memória. **Não é um modelo de IA generativa**: seus vínculos são classificados por regras locais, explicitamente; a integração com um LLM será posterior.
- Entradas com aparência de senhas, tokens e chaves são rejeitadas no armazenamento da rede de memória. Não coleta automaticamente outras janelas ou dados do navegador.

## Atualização Windows no mesmo lugar

A versão é `0.1.1` e mantém **exatamente** o `appId=site.salevo.unificdesktop`, o `productName=Unific Desktop`, a arquitetura x64 e o alvo **NSIS per-user** da V1. O GUID gerado pelo electron-builder permanece o mesmo. O instalador NSIS `Unific-Desktop-Setup-0.1.1.exe` procura a instalação existente para atualizar; **não é preciso desinstalar a V1**. O instalador tem fluxo one-click, preserva userData, preferências, credenciais e a pasta MediaForge-Staging-V2. O aplicativo pode pedir para fechar a versão anterior durante a atualização.

## Correção de tarefa agendada protegida

Na V1, `bootstrap-worker.ps1` chamava `start-worker-background.ps1`, que tentava `Unregister-ScheduledTask` e falhava com `0x80070005` quando não tinha autorização. A V1.1 muda o comportamento:

- **Preparar dependências** nunca altera, remove ou reinicia tarefas existentes.
- **Reiniciar worker** usa um script específico: se a tarefa já existe, tenta `Stop-ScheduledTask`/`Start-ScheduledTask`, sem desregistrar nem recriar. Se o Windows negar acesso, mostra erro orientativo e não altera nada.
- Se não existe tarefa e as credenciais estão configuradas, inicia o worker em segundo plano, sem criar tarefa adicional.
- Não elimina o bloqueio HTTP 403 identificado na Hostinger: isso exige correção da proteção/rota no servidor.

## Desenvolvimento

```powershell
cd desktop/unific-desktop
npm install
npm test
npm run dist
```

O GitHub Actions compila em `windows-latest`, executa os testes e gera o instalador assinado **não** (beta sem assinatura digital) como artefato temporário. No Windows, o instalador pode disparar o alerta SmartScreen; é importante confirmar a origem e não desabilitar as proteções do sistema.

## Primeiro teste

1. Com a V1 instalada, execute o arquivo `Unific-Desktop-Setup-0.1.1.exe`; não desinstale nada.
2. O app continua iniciado na bandeja do Windows. Clique na área de trabalho, mova o mouse até o topo; a barra horizontal deve abrir sem bolha fixa no canto.
3. Com outra janela ativa, passar o mouse no topo não deve abrir o painel.
4. Clique em **Assistente** para enviar uma pergunta e em **Configurações** para verificar os nós da memória e o aprendizado automático.
5. Verifique que os logs e a instalação antiga são detectados. **Não reinicie worker durante renderização real**.

## Estado de testes

Os testes automáticos cobrem os componentes de memória e migração, preservação das tarefas existentes e identidade de instalação. O comportamento de hover, da tarefa agendada protegida e da atualização real **precisa ser validado em um Windows com V1 instalada**. Um build de GitHub Actions bem-sucedido não substitui esses testes físicos.


## V1.2 — Conectar MediaForge sem PowerShell manual

- Configurações → Conectar MediaForge → abrir painel e colar token Worker.
- Validação prévia de HTTPS em POST /v1/worker/auth-check: falhas HTTP 401 e 403 não modificam a credencial Windows.
- Token transferido para um processo PowerShell protegido **pela entrada padrão**, nunca como parâmetro de execução ou log; gravado em .mediaforge/worker-token.dpapi com DPAPI do usuário Windows.
- .env.local conserva outras configurações e remove tokens em texto puro; URL correta do servidor.
- O usuário confirma separadamente o reinício na aba MediaForge, após a credencial ser salva.
- Atualização sobre V1.1 sem desinstalar, appId e dados preservados.
- Sem token cadastrado por este chat e sem alteração do servidor Hostinger.
