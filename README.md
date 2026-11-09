# Painel de SLA de abastecimento do picking

Painel estático para acompanhar o SLA de 24 horas por mês, tipo de mapa, categoria, operador e produto.

## Publicar no GitHub Pages

1. Extraia o ZIP e envie os arquivos extraídos para a raiz da branch principal do repositório. Coloque `index.html`, `styles.css`, `load-data.js`, `app.js`, `README.md` e `.nojekyll` no mesmo nível.
2. No repositório, abra **Settings → Pages**. Em **Source**, selecione **Deploy from a branch**.
3. Selecione a branch `main`, ou a branch onde colocou os arquivos, e a pasta `/(root)`. Clique em **Save**.
4. Quando o endereço aparecer em **Settings → Pages**, abra o site.

[Instruções do GitHub Pages](https://docs.github.com/pt/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Abrir os indicadores

Na página do painel, clique em **Escolher arquivo** e selecione `Dados_SLA_Picking.json`. O arquivo contém os dados da operação e nomes de operadores. Guarde-o no computador e envie ao GitHub somente os arquivos do ZIP. O navegador lê o JSON localmente, sem enviá-lo ao site.

Para testar antes de publicar, abra `index.html` no navegador e selecione o mesmo JSON. O painel usa as planilhas originais como fonte, já consolidadas nesse arquivo.
