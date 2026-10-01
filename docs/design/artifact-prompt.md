# Design sprint — prompt for Claude Artifacts

Paste the prompt below into a new claude.ai conversation (Artifacts enabled). Open the resulting artifact on the
tablet (Galaxy Tab A9+) and on the phone (Galaxy S25) and iterate in the same conversation.

---

```
Quero que você me ajude a criar a identidade visual e as telas de um app pessoal chamado **Banca**.

## O app
Banca é um app Android pessoal para tablet (Samsung Galaxy Tab A9+, 11", 1920×1200) e celular (Galaxy S25) para
descobrir e ler revistas pulp digitalizadas pelo Internet Archive. A primeira revista é Amazing Stories (1926–1956):
309 edições, mais de 4.000 histórias, com busca por título, autor, editor, capista e tradutor. Depois virão outras
revistas pulp (Fantasy & Science Fiction, Galaxy, Fantastic, Asimov's, Twilight Zone) e revistas de RPG (Dragon,
Dungeon, The Space Gamer), separadas por categoria.
O nome vem da banca de jornal: o app é uma banca onde ficam penduradas revistas de todas as épocas.
A interface é em inglês. O app é de uso pessoal, não será publicado.

## Telas que existem hoje (para redesenhar)
1. **Library (a banca):** busca, estante "Continue reading" (capas com a página onde parei) e um card por revista
   com um mosaico de capas.
2. **Magazine:** grade de capas de todas as edições, filtros por década e ano e "readable only". Edições sem scan
   aparecem esmaecidas.
3. **Issue:** capa grande, capista, editor, botões "Read now" / "Continue · page 42" / "Download" e sumário (página,
   título, autores clicáveis, tipo: conto, noveleta, editorial…).
4. **Person:** autor ou artista com obras, capas e edições que editou.
5. **Search:** resultados agrupados (pessoas, edições, histórias) com filtro por papel e intervalo de anos.
6. **Reader:** página escaneada em tela cheia, com zoom por pinça, toque nas bordas ou deslize para virar página
   (funciona também com zoom), seleção de texto por toque longo (OCR) e marca-texto.

## Telas novas a desenhar
- **Reader chrome:** barra superior e inferior que somem durante a leitura; slider de páginas com miniaturas; botões
  para índice de páginas, sumário (drawer), brilho/filtro quente, tema (claro, escuro, sépia) e "enhance text" (filtro
  que realça letras gastas de scans antigos).
- **Índice de páginas:** grade de miniaturas de todas as páginas, com o início de cada história marcado.
- **Atlas (futuro, só um esboço):** uma área para explorar a história da ficção e das artes. Uma linha do tempo
  interativa com faixas (revistas, histórias, autores, filmes, música, pintura, mangá, eventos do mundo), páginas de
  entidades ligadas por "influenciou / adaptado como / mesmo tema / explore a seguir" e listas de "quero ler / assistir
  / ouvir / ver".

## Minhas sugestões de direção visual (pode propor alternativas)
- A estética das próprias revistas pulp: amarelo e vermelho saturados com azul profundo (capas de Frank R. Paul),
  textura sutil de retícula Ben-Day, sensação de papel barato envelhecido.
- Tipografia: títulos em fonte condensada de letreiro de banca (ex.: Oswald, Bebas Neue, Anton ou algo mais
  original), textos em serifada confortável (Literata ou Source Serif). Números tabulares para páginas e datas.
- Dois climas: **"banca à noite"** (tema escuro, capas brilhando como sob luz de neon) e **"papel envelhecido"** (sépia/claro).
- As capas são as estrelas: grandes, com sombra, sem molduras pesadas; a interface recua para elas aparecerem.
- No leitor, quase nada de interface: ícones grandes e claros, alvos de toque ≥ 48 dp, tudo some com um toque no centro.
- Detalhes de "banca": etiqueta de preço/data no canto da capa (ex.: "APR 1926 · 25¢"), selo "readable" como carimbo,
  prateleiras/varais como metáfora para as estantes.

## O que quero receber
1. Um quadro de identidade com **3 direções** diferentes para Banca: logo/wordmark, paleta (com tokens de cor
   claro/escuro), tipografia e 1 tela de exemplo (Library) em cada direção, lado a lado.
2. Depois que eu escolher uma direção: um mini design system (cores, tipografia, botões, chips, cards de capa, barra
   do leitor, ícones) e protótipos navegáveis de Library, Magazine, Issue, Reader (com chrome visível), Índice de
   páginas e um esboço do Atlas, cada um em **tablet paisagem (1920×1200)** e **celular retrato (S25, ~412 dp de
   largura)**.
3. Use capas de placeholder (retângulos com cor/gradiente e título) e textos reais de exemplo: "Amazing Stories,
   April 1926", "The Man from the Atom — G. Peyton Wertenbaker", "Off on a Comet — Jules Verne".
4. Explique brevemente as escolhas (por que essa fonte, por que essa cor) e como elas viram tokens CSS (variáveis em
   `:root`), porque o app é React + TypeScript + CSS e vou implementar a partir disso.
```
