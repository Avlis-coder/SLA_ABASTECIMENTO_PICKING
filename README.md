# Painel de SLA de abastecimento do picking

O painel abre com os indicadores da operação. A base incluída cobre os mapas criados de 25/08/2026 a 09/11/2026.

**Indicadores** reúne os KPIs e o SLA. **Detalhamento** permite consultar mapas, itens, categorias, operadores e períodos. **Produtividade** mostra mapas e itens abastecidos por hora prevista, com jornada editável.

## Publicar no GitHub Pages

1. Extraia o ZIP. Envie `index.html`, `styles.css`, `data.js`, `productivity.js`, `app.js`, `README.md` e `.nojekyll` para a raiz do repositório. Se já publicou uma versão, substitua os arquivos de mesmo nome e inclua `productivity.js`.
2. Abra **Settings → Pages**. Em **Source**, selecione **Deploy from a branch**.
3. Escolha a branch em que colocou os arquivos, normalmente `main`, e a pasta `/(root)`. Clique em **Save**.
4. Abra o endereço exibido em **Settings → Pages**. O painel carrega os dados automaticamente.

Para conferir antes de publicar, abra `index.html` no navegador com todos os arquivos extraídos na mesma pasta.

## Visibilidade dos dados

O arquivo `data.js` contém dados operacionais e nomes de operadores. Quem tiver acesso ao site poderá consultar esses dados. Confira a visibilidade da página antes de publicar.

[Configuração do GitHub Pages](https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
