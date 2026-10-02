# Atlas design sprint — prompt for Claude Artifacts

Best option: paste it **into the same claude.ai conversation / Claude Design canvas used for the Banca identity**
(<https://claude.ai/artifact/5E8QSLiLmr21jYgZiDjr8K>), so the Newsprint system, the DS artboard and the existing
`TabAtlas` / `PhAtlas` sketches are already there. In a new conversation the prompt is self-contained.
Open the result on the tablet (Galaxy Tab A9+) and on the phone (Galaxy S25) and iterate in the same conversation.

---

```
Quero desenhar a área **ATLAS** do Banca. Já temos a identidade visual "Newsprint" (descrita abaixo). Agora preciso
das telas do Atlas para tablet e celular, nos temas Paper e Night, prontas para eu revisar nos aparelhos e depois
implementar.

## O app (contexto)
Banca é um app Android pessoal (tablet Samsung Galaxy Tab A9+ e celular Galaxy S25) para descobrir e ler revistas
pulp digitalizadas pelo Internet Archive. Hoje tem: Library (estante "Continue reading" + revistas), Magazine (grade de
capas), Issue (capa, sumário, Read/Download), Person, Search, Notes (highlights e notas) e um leitor de páginas
escaneadas. Primeira revista: Amazing Stories (1926–1956, 309 edições, 4.000+ histórias). Depois virão outras pulps,
revistas de RPG e quadrinhos. A interface é em **inglês**. Uso pessoal, não será publicado.
Navegação: masthead com abas PULP / RPG / ATLAS no tablet; no celular, barra inferior Pulp · RPG · Atlas · Search.

## O que é o Atlas
Um "museu" para **descobrir**: uma camada de conhecimento curada que liga as histórias das revistas a autores, temas,
movimentos, eventos do mundo, filmes e séries, música, quadrinhos/mangá e artes visuais (pintura, ilustração — as
próprias capas pulp são arte — fotografia, arquitetura). Princípios:
1. **Recomendação é o objetivo central.** Toda tela termina em "o que explorar a seguir", com o motivo
   ("Because you read *Marooned off Vesta*", "Same theme: robots", "Adapted as…").
2. **Conteúdo curado e offline.** Os textos são escritos fora do app (com fontes citadas) e revisados pelo dono;
   o app só mostra. Sem IA na hora do uso. Cada afirmação tem fonte (URL) e cada imagem tem crédito e licença.
3. **Tudo se conecta ao catálogo.** Quando uma obra existe numa revista do Banca, aparece o botão para abrir a
   edição/página no leitor ("READ IN BANCA", com o carimbo READABLE).
4. **Todas as formas de arte com o mesmo peso.** Literatura, cinema/séries, música, quadrinhos/mangá, artes
   visuais, eventos históricos.
5. **Listas pessoais:** Want to read / Want to watch / Want to listen / Want to see, com itens adicionados de
   qualquer lugar (timeline, página de entidade, recomendação).
Links externos: música abre o **Spotify**; filmes/séries mostram descrição curta e link para o **IMDb**; obras de
arte mostram imagem do Wikimedia Commons / acervo aberto de museu, com crédito.

## Primeiro conteúdo (piloto) — "From Wells to Foundation"
Um caminho guiado de ~30–40 itens. Use estes exemplos nas telas (dados ilustrativos; o conteúdo real será revisado):
- H. G. Wells (1866–1946); *The Time Machine* (1895); *The War of the Worlds* (1898).
- Amazing Stories, April 1926 — Hugo Gernsback lança a primeira revista só de ficção científica e reimprime Wells
  ("The New Accelerator"); capa de Frank R. Paul (ilustração = arte visual).
- *The War of the Worlds* no rádio (Orson Welles, 1938), no cinema (George Pal, 1953; Spielberg, 2005) e na música
  (álbum de Jeff Wayne, 1978).
- Astounding Science Fiction e John W. Campbell (editor desde 1937); a "Golden Age" (~1938–1946).
- Isaac Asimov: primeiro conto publicado, "Marooned off Vesta", **Amazing Stories, March 1939** (existe no
  catálogo → READ IN BANCA); "Nightfall" (1941); as Três Leis em "Runaround" (1942); *I, Robot* (1950);
  *Foundation* (contos 1942–1950, livro 1951); série *Foundation* (2021).
- Eventos do mundo nas faixas: Segunda Guerra (1939–1945), Hiroshima (1945), Sputnik (1957).
Temas para chips: robots, time travel, alien invasion, galactic empires, psychohistory.

## Telas a desenhar (tablet 1280×800 dp paisagem e celular 412×892 dp retrato; Paper e Night)
1. **Atlas Home** — porta de entrada: caminho em destaque ("From Wells to Foundation", com progresso de quantos
   itens já explorei), "Continue exploring", "Explore next" (recomendações com motivo), atalhos para as listas
   Want to…, busca do Atlas, e um mini-teaser da timeline.
2. **Timeline** — o coração do Atlas. Eixo horizontal de tempo (1890 → hoje) com **faixas (lanes)** por forma:
   Magazines & stories · Books · Film & TV · Music · Visual art · Comics & manga · World events. Zoom por período
   (century → decade → year) com pinça e com um controle visível; itens como cartões pequenos (miniatura + título +
   ano); ao tocar num item, ele fica selecionado e **linhas de conexão** mostram suas ligações para itens de outras
   faixas; uma folha (sheet) com o resumo e "Open". Filtro de faixas (ligar/desligar) e "Jump to year".
   No celular: proponha a melhor adaptação (por exemplo timeline **vertical**, anos descendo, faixas como colunas
   estreitas ou como chips de filtro). Mostre o estado com um item selecionado e as conexões visíveis.
3. **Entity page** — um modelo que sirva para todos os tipos, com variações:
   pessoa (Asimov), obra literária (*Marooned off Vesta*, com READ IN BANCA), filme (*War of the Worlds*, 1953, com
   link IMDb), música (álbum de Jeff Wayne, com botão Spotify), obra de arte (capa de Frank R. Paul, com crédito e
   licença da imagem), tema (Robots) e evento (Sputnik). Partes: imagem/hero com crédito, tipo + datas, resumo
   curto (2–4 parágrafos), fatos-chave, **Connections** agrupadas por tipo de ligação (Influenced · Influenced by ·
   Adapted as · Same theme · Published in · Read next), **Explore next** com motivo, botão **Add to Want to…**,
   **Sources** (lista numerada de links; marcadores de citação discretos no texto, tipo [1]).
4. **Path view** — o caminho guiado como um percurso de museu: passos numerados, cada um com imagem, ano, 1–2 frases
   e "why it matters"; progresso; "Next stop". Pode ser vertical com uma linha conectando as paradas.
5. **Want to… lists** — abas Read / Watch / Listen / See; linhas com miniatura, tipo, ano, de onde veio ("from
   Timeline · Asimov") e ações (open, done, remove). Itens lidos/vistos ficam riscados ou num grupo "Done".
6. **Componentes do Atlas** (num artboard de sistema, como o DS existente): badge de tipo de entidade com cor/ícone
   por forma de arte (book, story, film, series, music, visual art, comic, event, person, theme, magazine), chips de
   tipo de ligação, card de recomendação com motivo, crédito de imagem, marcador de citação + item de fonte, botão
   "Add to Want to…" (estados), legenda das faixas, item da timeline (normal / selecionado / conectado / "READABLE").

## Sistema visual (respeitar — já implementado no app)
Direção "Newsprint": papel envelhecido, tinta quase preta quente, retícula Ben-Day, bordas de 2 px em tinta com
sombras deslocadas sem desfoque, carimbos e etiquetas de preço. As imagens (capas, pôsteres, pinturas) são as
estrelas; a interface é papel e tinta em volta.
Tokens Paper: --bg #EEE2C6, --surface #F7EEDA, --surface-2 #E4D4AF, --ink #2A2118, --text-muted #5E4E3A,
--line #2A2118, --rule #D6C6A2, --pulp-red #C8321F, --on-red #FFF4DC, --pulp-yellow #F2B705, --press-blue #1F4E8C,
--marker #F2B70566, --shadow-print 4px 4px 0 var(--ink) (cards 6 px).
Tokens Night: --bg #0E1222, --surface #171C30, --surface-2 #222842, --ink #F1E4C6, --text-muted #ABA38C,
--line #3A4160, --rule #2A3150, --pulp-red #FF5A44, --on-red #0E1222, --pulp-yellow #FFC93C, --press-blue #86A8F0;
capas/imagens com brilho: 0 10px 24px rgb(0 0 0 / .6), 0 0 30px rgb(255 201 60 / .18).
Retícula: radial-gradient(rgb(255 240 200 / .16) 1.3px, transparent 1.8px) 0 0 / 7px 7px sobre o vermelho do
masthead (nunca sobre imagens reais).
Tipografia: **Big Shoulders Display** 800–900 em caixa alta (títulos, seções, botões, wordmark BANCA amarelo com
sombra azul 3px 3px) e **Source Serif 4** 400/600/700 para todo o resto, números tabulares em datas e anos.
Escala: display 64/40, seção 28 (celular 24), título 22, corpo 17, meta 14, label 12 caixa alta +0.12em.
Componentes existentes: masthead vermelho com retícula e borda inferior 3 px; botões 52 dp, raio 4, borda 2 px,
sombra de impressão, primário vermelho; chips 40–44 dp com seleção amarela; selos/tags tipo "SERIAL",
"NOVELETTE"; carimbo redondo vermelho "READABLE"; etiqueta de preço amarela girada −5°; ícones 24 px traço 2 px.
Se precisar de cores extras para as faixas da timeline, derive-as da paleta (vermelho, amarelo, azul, tinta, mais
no máximo 3 tons novos coerentes com papel/impressão) e mostre-as nos dois temas com contraste suficiente.

## Restrições
- Toque ≥ 48 dp; legível a 40 cm no tablet; contraste AA.
- Performance num tablet intermediário: nada de blur pesado, sombras desfocadas grandes ou animações contínuas;
  a timeline vai ser virtualizada (desenhe pensando em centenas de itens, com agrupamento quando há muitos no mesmo
  ano: "+12").
- Imagens sempre com crédito visível (pequeno) e espaço para "no image" (placeholder com retícula, como as capas
  sem scan).
- Tudo em inglês na interface.

## Entrega
1. Artboards: para cada tela, versão **tablet** e **celular**, em **Paper**; e pelo menos Timeline e Entity page
   também em **Night**. Nomeie como os existentes (TabAtlasHome, PhAtlasHome, TabTimeline, PhTimeline, TabEntity…,
   PhEntity…, TabPath, PhPath, TabWantTo, PhWantTo, AtlasDS).
2. Interativo onde ajudar a avaliar: na Timeline, tocar num item mostra as conexões; zoom década/ano alternável; na
   Entity page, alternar entre os tipos (person / story / film / music / art / theme / event).
3. No fim, um **resumo de especificação** em Markdown que eu possa colar no repositório: novos tokens (cores das
   faixas, tamanhos), componentes com medidas e estados, regras de interação da timeline (zoom, seleção, conexões,
   agrupamento), comportamento no celular, e as decisões que você tomou e por quê.
Pergunte antes de começar se algo estiver ambíguo; proponha 2 alternativas para a Timeline (tablet) antes de
detalhar as outras telas.
```
