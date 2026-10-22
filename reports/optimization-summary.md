# Tamarind — otimização web dos GLBs

## Resumo

- Total original ativo: **399.14 MB**
- Total otimizado: **48.08 MB**
- Redução: **351.06 MB (88.0%)**
- Geometria: Meshopt em todos os GLBs; simplificação moderada apenas no castelo distante e nas árvores instanciadas.
- Texturas: WebP, com limite por categoria; originais mantidos para rollback.

## Antes x depois

| GLB | antes | depois | redução | redução % | triângulos antes | triângulos depois | texturas antes | texturas depois |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ilha_texturizada.glb | 7.82 MB | 1.39 MB | 6.43 MB | 82.2% | 266.236 | 266.236 | 2 | 2 |
| casanovatecnomago.glb | 4.00 MB | 0.83 MB | 3.16 MB | 79.1% | 30.994 | 30.994 | 4 | 4 |
| basilica_texturizada.glb | 24.59 MB | 4.80 MB | 19.79 MB | 80.5% | 948.264 | 948.264 | 2 | 2 |
| arquiteturaColiseu_texturizado.glb | 20.33 MB | 4.02 MB | 16.31 MB | 80.2% | 770.098 | 770.098 | 2 | 2 |
| casteloSite.glb | 145.83 MB | 10.54 MB | 135.29 MB | 92.8% | 1.702.890 | 1.142.766 | 20 | 16 |
| templo.glb | 49.79 MB | 6.90 MB | 42.89 MB | 86.1% | 519.281 | 519.281 | 12 | 12 |
| casasite.glb | 50.39 MB | 3.65 MB | 46.75 MB | 92.8% | 25.958 | 25.958 | 25 | 25 |
| arvore.glb | 94.23 MB | 15.50 MB | 78.73 MB | 83.6% | 1.421.559 | 994.431 | 9 | 9 |
| bode_rigged.glb | 2.16 MB | 0.46 MB | 1.71 MB | 78.9% | 17.074 | 17.074 | 6 | 6 |

## Medição local do carregamento

| métrica | antes | depois | variação |
|---|---:|---:|---:|
| mundo completo | 25,12 s | 19,76 s | -21,3% |
| primeiro render após a ilha crítica | ~143 ms | ~142 ms | estável |
| payload potencial dos 9 GLBs ativos | 399,14 MB | 48,08 MB | -88,0% |

Medição feita no servidor Vite local. Cache e velocidade de disco local reduzem os tempos de request; a queda de payload é o indicador mais representativo para a Vercel.

## Faixa costeira

A amostragem de terreno foi movida para desenvolvimento/build. O navegador carrega `public/artwork/data/coastline.web.json` e apenas monta quatro geometrias leves, preservando shaders e materiais atuais.
