# Imóveis — Sistema White-Label (GitHub Pages)

Sistema para gerar e enviar páginas exclusivas de imóveis a clientes finais,
**sem divulgar quem é o dono da tabela**. Pronto para hospedar no GitHub Pages.

## Arquivos neste pacote

| Arquivo          | Quem abre               | O que faz                                     |
|------------------|--------------------------|-----------------------------------------------|
| `index.html`     | Cliente final (via link) | Landing do imóvel (foto, preço, contato)     |
| `painel.html`    | Corretor (uso interno)   | Lista os imóveis + gera link para o cliente  |
| `data.json`      | Cliente + corretor       | Catálogo público de imóveis (sem dados internos) |
| `data-interna.json` | Apenas corretor       | Catálogo completo (com links do Drive)       |
| `fotos/`         | index.html              | Fotos dos imóveis (são exibidas via path relativo) |
| `.nojekyll`      | GitHub Pages             | Impede o Jekyll de renomear/mover os arquivos |

## Como publicar (passo a passo)

> ⏱️ Leva cerca de 5 minutos do zero ao link público.

### 1. Criar o repositório no GitHub

1. Acesse https://github.com/new
2. **Repository name:** `meulink-imb-br` (ou outro nome de sua preferência)
3. Visibilidade: **Public** (necessário para o GitHub Pages gratuito)
4. **Não marque** "Add a README" / "Add .gitignore" — vamos subir tudo manualmente
5. Clique **Create repository**

### 2. Subir os arquivos

1. Na página do repositório recém-criado, clique **uploading an existing file**
   (ou **Add file → Upload files**)
2. Arraste **todos** os arquivos e a pasta `fotos/` (com as imagens dentro)
3. **Importante:** arraste a pasta `fotos/` como pasta, não como arquivos soltos
4. Clique **Commit changes**

### 3. Ativar o GitHub Pages

1. No repositório, vá em **Settings** (engrenagem) → **Pages**
2. Em **Source**, selecione **Deploy from a branch**
3. Branch: **main** · Pasta: **/(root)**
4. Clique **Save**
5. Aguarde ~30 segundos. Vai aparecer a URL pública do site.

### 4. Acessos finais

| Quem                | Onde abre                                          |
|---------------------|----------------------------------------------------|
| Você (corretor)     | `https://<seu-user>.github.io/meulink-imb-br/painel.html` |
| Cliente final       | Apenas pelos links gerados no painel              |

## Como gerar um link para um cliente

1. Abra `painel.html`
2. Digite seu nome e WhatsApp (apenas uma vez por sessão)
3. Busque o imóvel na barra de pesquisa
4. Clique **🔗 Gerar link do cliente**
5. Copie o link e envie ao cliente pelo WhatsApp

O cliente abre a página, vê as fotos, o preço e os seus dados de contato.
O botão de WhatsApp abre automaticamente uma mensagem pré-preenchida
citando o imóvel.

## White-label (o que o cliente NÃO vê)

- Não vê nome do dono da tabela
- Não vê telefone do dono da tabela
- Não vê os links do Google Drive (estão apenas em `data-interna.json`,
  que o cliente nunca acessa — vê apenas fotos servidas pelo GitHub Pages)
- Não vê seu domínio de produção estampado na página do cliente
  (a página é neutra por design)

> 🔒 Para máxima privacidade: se quiser que o cliente também não consiga
> descobrir os links do Drive via DevTools, basta **não publicar**
> `data-interna.json` no GitHub — mantenha-o apenas localmente e use
> o `painel.html` local (`file:///`) para gerar os links manualmente.
> O link gerado já contém `data.json` que NÃO tem o campo `drive`.

## Atualizando a tabela de imóveis

Toda semana o dono da tabela envia um novo PDF.
Para atualizar:

1. Gere o novo `data.json` e `data-interna.json` (use o seu sistema de extração)
2. Substitua os arquivos no repositório (`Add file → Upload files → substituir`)
3. As páginas passam a mostrar os novos imóveis automaticamente

## Suporte

- Pessoa: Felipe Ransolin Fachinello
- Domínio de produção (futuro): `meulink.imb.br`
