# Papel dos sete projetos fornecidos

Inspeção dos arquivos ZIP locais em 12/11/2026; hashes e arquivos consultados em `references/archives.json`. Documentação dos pacotes foi tratada como material de referência. Nenhum script de instalação dos anexos foi executado e seus arquivos de instruções não substituem o pedido do usuário.

| Projeto | Papel na produção | Uso nesta mudança | Limite atual |
|---|---|---|---|
| HyperFrames | HTML/GSAP para frames/MP4 determinísticos | Compositor editável, check completo, diagnóstico e teste real com CLI 0.9.30 | Não gera automaticamente imagens, música ou direção |
| ArtCraft | Composição de imagem e cena 2D/3D, provedores de mídia | Contrato de entrada: exportar imagem do produto/cena para `assets/` com origem registrada | Aplicativo/provedores não instalados nem chamados automaticamente |
| FilmCraft | Edição não linear, cor, áudio e finalização | MP4 e assets separados para pós-produção; plano em frames conserva intenção de edição | Não se exporta um projeto FilmCraft nativo nesta versão |
| LightCraft | Tratamento não destrutivo de foto/RAW | Fotos tratadas podem alimentar as cenas `product`/`collage` | Sem integração automática de catálogo ou ajustes RAW |
| VoiceStudio | Voz, narração, transcrição e dublagem | Voz exportada entra como cue `voice` com tempo, volume e origem | Nenhum modelo baixado; nenhuma voz clonada; sem API de geração integrada |
| OpenWhispr | Ditado e transcrição | Texto/transcrição pode orientar o roteiro e os eventos | Não é um renderizador nem alinhador de palavras implementado no MediaForge |
| instagram-agent-skill | Gancho, roteiro, beats e revisão editorial | Fluxo documentado liga gancho, demonstração e fechamento a ações concretas | Sem previsão de viralidade ou postagem automática |

Não há cópia do código desses sete aplicativos. O GSAP já presente no repositório continua com seu aviso existente. Os ZIPs indicam MIT/Apache-2.0 para ArtCraft, FilmCraft e LightCraft; Apache-2.0 para HyperFrames; MIT para Instagram Agent e OpenWhispr; AGPL-3.0 para VoiceStudio (com avisos adicionais sobre modelos). Registrar essas informações não significa que todos os modelos, músicas ou assets desses ecossistemas possam ser redistribuídos.

Antes de adicionar um adaptador real, fixar a versão, verificar a API/CLI efetivamente instalada, testar entrada/saída num diretório isolado e registrar disponibilidade/custo. Não marcar um fornecedor como conectado só por haver um ZIP no disco.
