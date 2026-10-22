# Auditoria agressiva de carregamento — Tamarind

Data: 2026-10-21  
Branch: `perf/aggressive-load-audit`

## Escopo e método

- O visual, posições, câmera, iluminação, UI, hotspots, modo dia/noite e comportamento dos NPCs foram preservados.
- O diagnóstico mede download, parse e tempo total de cada GLB com `performance.now()` e mantém `console.time()` por asset.
- A validação abaixo foi feita no preview Vite local, em uma origem nova (`127.0.0.1:5177`) para evitar o cache HTTP da origem anterior.
- O tempo de produção continua sujeito à rede, CDN e dispositivo. Antes desta rodada, o relato de produção era de aproximadamente 30 s e a medição local anterior registrada no projeto era de 19,76 s até o mundo completo.

## Resultado antes/depois

| Métrica | Antes | Depois (origem local nova) | Variação |
| --- | ---: | ---: | ---: |
| Primeiro render útil | sem liberação antecipada confiável | 0,47 s | abaixo da meta de 2 s |
| Landmarks principais | aguardavam o fluxo pesado | 1,18 s | abaixo da meta de 5 s |
| Mundo completo | 19,76 s local / ~30 s relatado em produção | 6,88 s | -65,2% contra a medição local |
| Payload dos 10 GLBs ativos | 89,98 MB | 31,57 MB | -58,42 MB (-64,9%) |
| Requests de GLB | 10 | 10 | 0 duplicados |

Uma segunda leitura com cache aquecido terminou em 6,70 s (primeiro render em 0,29 s e landmarks em 0,87 s).

Durante a instrumentação, antes de substituir os raycasts procedurais pelo índice espacial, a mesma página mediu 3,56 s para o primeiro render, 5,41 s para os landmarks e 42,95 s para o mundo completo. Essa leitura isolou o bloqueio de CPU que não aparecia na análise de tamanho dos arquivos.

## Medição por asset após a otimização

| Asset | Tamanho | Download | Parse | Integrado até |
| --- | ---: | ---: | ---: | ---: |
| Ilha/base | 1,39 MB | 26 ms | 23 ms | 49 ms |
| Casa do Tecnomago | 0,83 MB | 12 ms | 48 ms | 60 ms |
| Basílica Apps | 4,80 MB | 55 ms | 30 ms | 303 ms |
| 3D/Arquitetura | 4,25 MB | 50 ms | 39 ms | 512 ms |
| Templo oriental | 6,90 MB | 244 ms | 100 ms | 345 ms |
| Castelo ao fundo | 1,39 MB | 222 ms | 38 ms | 705 ms |
| Casas da vila | 3,65 MB | 229 ms | 99 ms | 1.166 ms |
| Árvores | 7,63 MB | 278 ms | 32 ms | 2.779 ms |
| Bode | 0,46 MB | 224 ms | 48 ms | 3.884 ms |
| Mago NPC | 0,27 MB | 224 ms | 14 ms | 4.185 ms |

O tempo “integrado até” inclui o agendamento ocioso e a construção da cena, portanto não deve ser interpretado como tempo de parse.

## GLBs pesados encontrados no inventário original

### Acima de 50 MB

| Asset | Tamanho | Triângulos | Texturas | Maior textura |
| --- | ---: | ---: | ---: | ---: |
| `arvore.glb` | 94,23 MB | 1.421.559 | 9 | 2048 px |
| `casasite.glb` | 50,39 MB | 25.958 | 25 | 3011 px |

### Acima de 20 MB

| Asset | Tamanho | Triângulos | Texturas | Maior textura |
| --- | ---: | ---: | ---: | ---: |
| `templo.glb` | 49,79 MB | 519.281 | 12 | 2048 px |
| `architecture_landmark.glb` | 32,76 MB | 498.604 | 3 | 1024 px |
| `basilica_texturizada.glb` | 24,59 MB | 948.264 | 2 | 512 px |
| `fantastic_castle.glb` | 21,19 MB | 53.629 | 15 | 1024 px |

### Acima de 10 MB

Além dos anteriores, a variante ativa antiga `arvore.web.glb` tinha 15,50 MB. O inventário completo, incluindo materiais, animações e skins, está em `reports/glb-audit.before.md` e `reports/glb-audit.before.json`.

## Assets substituídos nesta rodada

| Asset ativo anterior | Antes | Variante runtime | Depois | Redução |
| --- | ---: | --- | ---: | ---: |
| `architecture_landmark.glb` | 32,76 MB | `architecture_landmark.web.glb` | 4,25 MB | 87,0% |
| `fantastic_castle.glb` | 21,19 MB | `fantastic_castle.web.glb` | 1,39 MB | 93,4% |
| `free_battlemage_wizard.glb` | 2,51 MB | `free_battlemage_wizard.web.glb` | 0,27 MB | 89,3% |
| `arvore.web.glb` | 15,50 MB | `arvore.runtime.web.glb` | 7,63 MB | 50,8% |

As fontes originais permanecem no repositório para rollback e não são baixadas pelo runtime. As variantes usam Meshopt e texturas WebP. O bode preserva skin e animação existentes e não foi reprocessado nesta rodada.

## Alterações de arquitetura

- `THREE.Cache.enabled = true` continua ativo.
- Um único `GLTFLoader` com um único `MeshoptDecoder` é compartilhado.
- Download e parse foram separados para medir cada etapa e permitir prefetch concorrente sem bloquear o primeiro render.
- O carregamento ficou dividido em: crítico, landmarks, mundo habitado e decoração.
- Assets secundários usam `requestIdleCallback`, com fallback para `setTimeout`.
- Não existe `Promise.all` global segurando a primeira renderização.
- As chamadas repetidas reutilizam promises por URL; a rodada validada registrou zero requests duplicados.
- O assentamento procedural deixou de executar centenas de raycasts sobre 266.236 triângulos. Um índice espacial compacto em `Float32Array` mantém a mesma amostragem da superfície e reduziu o tempo de CPU da montagem.
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))` foi preservado.

## Validação

- `npm run build`: concluído sem erros.
- Vite emite apenas o aviso existente de chunk JavaScript acima de 500 kB (678,11 kB; gzip 180,49 kB).
- Preview conferido nos modos dia e noite.
- 10 requests de GLB, sem duplicação e sem erros 404/GLTFLoader observados.
- Nenhuma alteração foi feita na `main` e nenhum merge foi executado.
