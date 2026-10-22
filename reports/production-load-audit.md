# Auditoria de carregamento em produção — Tamarind

Data: 2026-10-21  
URL: `https://www.tamarindstudio.com.br/`  
Bundle publicado: `/assets/index-CjMw9W14.js`

## Conclusão

A produção não está executando a versão otimizada medida localmente. O bundle publicado ainda referencia nove GLBs originais, totalizando **413,54 MiB**, e integra os assets com `await` sequencial. Somando os quatro PNGs da interface (6,27 MiB), JavaScript, CSS e HTML, uma abertura fria transfere aproximadamente **420,43 MiB**.

O atraso percebido de aproximadamente 30 segundos é explicado pela combinação de:

1. payload antigo de 413,54 MiB de GLBs;
2. downloads e parses sequenciais;
3. montagem procedural síncrona entre os assets;
4. raycasts repetidos contra o terreno no bundle antigo;
5. custo de memória suficiente para derrubar uma das cargas frias no navegador de teste.

Git LFS não aparece no caminho de entrega do navegador. Os arquivos são GLBs binários reais, servidos diretamente pela Vercel, sem redirect.

## Testes executados

### Produção — rede fria, cache do cliente desabilitado

Foram executadas três rodadas completas dos nove GLBs com `Cache-Control: no-cache`.

| Rodada | GLBs transferidos | Tempo sequencial de rede |
| --- | ---: | ---: |
| 1 | 413,54 MiB | 9,09 s |
| 2 | 413,54 MiB | 13,28 s |
| 3 | 413,54 MiB | 10,77 s |

Esses números representam somente rede. O navegador ainda precisa descompactar estruturas internas, criar geometrias, enviar buffers à GPU e executar a geração procedural.

### Produção — navegador

- Primeira carga fria: o processo da página caiu antes de completar, após aproximadamente 35 segundos.
- Segunda carga: a ilha foi registrada às `01:20:28.068Z`; o bode, último GLB, terminou às `01:20:51.686Z`. Intervalo observado após a ilha: **23,62 s**.
- Recarga com cache do navegador: ilha às `01:22:15.541Z`; último GLB às `01:22:39.500Z`. Intervalo: **23,96 s**.

O cache aquecido praticamente não mudou a montagem. Isso prova que download não é o único gargalo: parse, criação procedural e trabalho de CPU em série continuam sendo executados.

### Local otimizado

| Marco | Local otimizado |
| --- | ---: |
| First render | 0,326 s |
| Landmarks | 0,900 s |
| Mundo habitado | 4,008 s |
| Mundo completo | 5,048 s |
| GLBs | 10 |
| Requests duplicados | 0 |

## GLBs realmente usados pela produção

| Asset publicado | Tamanho | TTFB médio | Download médio | Faixa total nas 3 rodadas | Cache |
| --- | ---: | ---: | ---: | ---: | --- |
| `ilha_texturizada.glb` | 7,82 MiB | 98 ms | 318 ms | 256–702 ms | revalidação |
| `observatorioTec_Texturizado.glb` | 18,39 MiB | 106 ms | 621 ms | 641–870 ms | revalidação |
| `arquiteturaColiseu_texturizado.glb` | 20,33 MiB | 96 ms | 416 ms | 397–670 ms | revalidação |
| `basilica_texturizada.glb` | 24,59 MiB | 116 ms | 617 ms | 669–836 ms | revalidação |
| `arvore.glb` | 94,23 MiB | 101 ms | 1.795 ms | 1.297–2.876 ms | revalidação |
| `templo.glb` | 49,79 MiB | 122 ms | 1.210 ms | 783–2.211 ms | revalidação |
| `casasite.glb` | 50,39 MiB | 105 ms | 1.453 ms | 792–2.807 ms | revalidação |
| `casteloSite.glb` | 145,83 MiB | 101 ms | 3.525 ms | 1.863–6.275 ms | revalidação |
| `bode_rigged.glb` | 2,16 MiB | 109 ms | 136 ms | 194–276 ms | revalidação |

Todos responderam com:

- HTTP `200` nas cargas frias;
- `Content-Type: model/gltf-binary`;
- `Cache-Control: public, max-age=0, must-revalidate`;
- nenhum `Content-Encoding`;
- zero redirects;
- domínio efetivo `www.tamarindstudio.com.br`;
- `Server: Vercel`;
- `X-Vercel-Cache: HIT` na maioria das medições.

Uma requisição condicional do castelo retornou `304 Not Modified` em 107 ms e sem corpo. O browser pode evitar a transferência em uma recarga, mas continua revalidando cada arquivo e recriando os GLBs na memória.

## Comparação por landmark

O bundle publicado não contém a instrumentação nova que separa download e parse. Por isso, `parse em produção` não pode ser isolado com precisão sem modificar o deploy. A coluna de produção abaixo usa somente download medido; os intervalos do console combinam parse, integração e trabalho procedural.

| Asset lógico | Download local | Parse local | Download produção | Parse produção |
| --- | ---: | ---: | ---: | --- |
| Ilha/base | 15 ms | 18 ms | 318 ms médio | não instrumentado no bundle publicado |
| Casa do Tecnomago | 11 ms | 36 ms | 621 ms médio | não instrumentado |
| 3D/Arquitetura | 31 ms | 43 ms | 416 ms médio | não instrumentado |
| Basílica | 35 ms | 25 ms | 617 ms médio | não instrumentado |
| Templo | 220 ms | 79 ms | 1.210 ms médio | não instrumentado |
| Castelo | 194 ms | 33 ms | 3.525 ms médio | não instrumentado |
| Casas da vila | 206 ms | 103 ms | 1.453 ms médio | não instrumentado |
| Árvores | 262 ms | 40 ms | 1.795 ms médio | não instrumentado |
| Bode | 198 ms | 46 ms | 136 ms médio | não instrumentado |

Os assets locais e os publicados não são os mesmos binários. A produção usa as versões originais; a branch otimizada usa variantes `.web.glb` muito menores. Portanto, a comparação não mede apenas diferenças de rede.

## Git LFS

- Nenhum redirect para GitHub ou domínio LFS foi observado.
- `Content-Length` corresponde ao GLB real.
- O conteúdo começa com o magic header `glTF`, não com texto de pointer LFS.
- A Vercel entrega os binários diretamente do próprio domínio.
- Não há evidência de throttling ou quota LFS no caminho runtime.

## Cache da Vercel

HTML, JS, CSS, PNGs e GLBs publicados usam `public, max-age=0, must-revalidate`.

Isso evita conteúdo permanentemente obsoleto, mas força revalidação. Cache longo pode ser aplicado futuramente somente após usar nomes versionados por hash para os assets públicos. Alterar apenas o cache não corrigirá os 24–30 segundos, pois a recarga aquecida continuou levando aproximadamente 24 segundos.

## Waterfall e paralelismo

O JavaScript publicado contém uma sequência equivalente a:

1. `await` ilha;
2. `await` Casa do Tecnomago;
3. `await` 3D/Arquitetura;
4. `await` Basílica;
5. `await` templo;
6. `await` castelo;
7. `await` árvore;
8. `await` vila;
9. `await` bode.

Os downloads não são iniciados em paralelo dentro de uma fase. A montagem procedural também ocorre entre os downloads, ampliando os espaços do waterfall.

## Causa principal e mudança mínima recomendada

**Causa principal:** a Vercel está servindo um build antigo, anterior à branch `perf/aggressive-load-audit`. Esse build baixa aproximadamente 420 MiB, usa os GLBs originais e carrega tudo em série.

**Mudança mínima recomendada:** publicar a branch otimizada já validada, que usa 31,57 MiB de GLBs, carregamento progressivo e integração ociosa. Nenhuma nova redução visual é necessária para resolver esta diferença.

Depois do deploy, repetir a mesma auditoria no domínio. Como melhoria secundária, usar nomes com hash para GLBs e imagens e então aplicar `Cache-Control: public, max-age=31536000, immutable` somente nesses arquivos versionados. O HTML deve continuar revalidável.
