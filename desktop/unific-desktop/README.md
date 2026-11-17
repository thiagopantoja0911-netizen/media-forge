# Unific Desktop 0.1.0 — Beta Windows

Aplicativo Windows com dashboard MediaForge, ícone flutuante, painel pequeno acionado por hover, bandeja do sistema, diagnóstico, reinício consciente do worker e memória local.

## Funcionalidades incluídas

- **Ícone flutuante**: posicionado no canto inferior direito, sempre disponível; ao passar o mouse, abre cartão de status. Clique para dashboard.
- **Bandeja do Windows**: mouse sobre ícone também abre cartão, clique abre dashboard; fechar janela não encerra monitoramento.
- **Dashboard**: status da API `/health`, heartbeat do HyperFrames, fila, últimos logs locais e estado de pareamento.
- **Gerenciamento**: reinicia o worker através do script já existente (após confirmação), não interfere nos outros processos.
- **Instalação automática**: em uma máquina sem worker, a primeira inicialização prepara as dependências via `winget`, `git clone`, `npm install` quando a pasta não existir. Também há botão para tentar novamente. Pasta V2 existente é preservada.
- **Memória local**: anotações armazenadas em `app.getPath('userData')/assistant-memory.json`, sem nuvem.
- **Assistente beta**: responde offline a perguntas sobre status, erros e anotações. Não há LLM integrado nesta versão.
- **Inicializar com Windows**: habilitado e ajustável no painel.

## Testar a interface em modo desenvolvimento

Requer Node.js 22+ e Windows:

```powershell
cd desktop/unific-desktop
npm install
npm test
npm start
```

## Gerar o instalador `.exe`

A workflow `.github/workflows/unific-desktop-windows.yml` compila em `windows-latest` e anexa `Unific-Desktop-Setup-0.1.0.exe` ao run como artefato. Também é possível executar `npm run dist` em Windows.

A assinatura de código não está configurada na versão beta. O Windows pode mostrar SmartScreen ao executar um instalador de teste não assinado; não desative a proteção global. Verifique o publisher e a origem.

## Testar com segurança

1. Instale o Unific Desktop e abra o dashboard.
2. Confira que o worker já existente é detectado antes de clicar em qualquer ação de manutenção.
3. Mova o mouse sobre o ícone flutuante: a aba compacta deve aparecer.
4. Clique no ícone: dashboard completo.
5. Salve uma nota em **Memória**, feche e reabra o aplicativo: a nota deve persistir.
6. Consulte o estado do worker. **Não reinicie durante uma renderização real.**
7. Para reiniciar o worker, o aplicativo pede confirmação explícita.

## Limitações / próximos marcos

- **A API remota pode continuar enviando HTTP 403** em POST de worker. O aplicativo não corrige bloqueios WAF/proxy; será necessário solucionar no servidor.
- O primeiro instalador **não emite nem cria credenciais**. Para um worker novo, deve ser configurado um token real com autenticação segura. Instalações existentes reaproveitam a credencial DPAPI no Windows.
- A função de instalação do worker depende de rede, winget, Git e versão Node compatível, e pode exigir aprovação do Windows. A aplicação inicia sem essas dependências para diagnóstico.
- O assistente tem memória local e respostas guiadas, não conversação generativa. IA e memória estruturada serão passos futuros.
- Sem testes físicos no Windows até que o build do GitHub Actions seja confirmado e executado em um computador Windows.
- Sem exclusão de instalações antigas nesta versão beta.

## Arquitetura

Electron main process → API remota MediaForge (somente GET `/health`), leitura segura de logs locais → UI dashboard + bubble/window hover → PowerShell incluído no repositório (`start-worker-background.ps1`) apenas após confirmação.

Todos os renderers têm `contextIsolation`, `sandbox`, `nodeIntegration: false` e CSP local. Credenciais nunca são exibidas no dashboard.
