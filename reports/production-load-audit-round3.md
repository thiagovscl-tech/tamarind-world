# Auditoria de carregamento de produção — rodada 3

Data: 2026-11-03

Produção medida: `https://www.tamarindstudio.com.br/?perf=cold-round3-before-20261103`

Branch: `perf/production-load-audit-round3`

## Cold load de referência

| Marco | Antes |
|---|---:|
| First render / ilha visível | 885 ms |
| Landmarks principais | 2.079 ms |
| Mundo habitado | 12.860 ms |
| Mundo completo | 15.053 ms |
| GLBs requisitados | 14 |
| Requests GLB duplicados | 0 |
| GLBs ativos | 37,648 MiB |
| TTFB do HTML (curl cold) | ~380 ms |

O primeiro frame já dependia somente de ilha/base, oceano, câmera, luzes e UI mínima. O gargalo principal estava depois dele: as tarefas secundárias eram iniciadas em uma cadeia de `await runWhenIdle(...)`, prolongando artificialmente o mundo completo mesmo quando os downloads já tinham terminado.

## Assets medidos em produção (antes)

| Asset | Tamanho | Download | Parse | Total |
|---|---:|---:|---:|---:|
| ilha/base | 1.458.976 B | 46 ms | 21 ms | 67 ms |
| Casa do Tecnomago | 874.344 B | 33 ms | 39 ms | 194 ms |
| Basílica Apps | 5.032.240 B | 83 ms | 25 ms | 480 ms |
| 3D / Arquitetura | 4.453.752 B | 83 ms | 37 ms | 774 ms |
| templo oriental | 7.239.600 B | 134 ms | 63 ms | 319 ms |
| castelo ao fundo | 3.274.208 B | 94 ms | 3 ms | 1.568 ms |
| casas da vila | 3.822.964 B | 119 ms | 94 ms | 1.929 ms |
| árvore Tipo A | 1.379.956 B | 90 ms | 22 ms | 4.722 ms |
| árvore Tipo B | 1.741.100 B | 95 ms | 2 ms | 4.989 ms |
| árvore leve castelo/templo | 173.352 B | 77 ms | 4 ms | 5.256 ms |
| árvore Tecnomago | 920.960 B | 87 ms | 15 ms | 5.534 ms |
| bode | 478.104 B | 80 ms | 26 ms | 10.194 ms |
| mago NPC | 282.972 B | 80 ms | 7 ms | 10.778 ms |
| fogueira | 8.344.516 B | 48 ms | 47 ms | 2.190 ms |

`Total` é o instante de conclusão do asset desde o início da navegação, não a soma de download e parse.

## Mudanças desta rodada

- Landmarks principais iniciados juntos com `Promise.all`, após o primeiro frame.
- Templo, castelo e vila iniciados juntos; bode e mago juntos; porto, costa e fogueira juntos.
- `requestIdleCallback` e fallback existentes foram preservados entre as fases.
- Fogueira: 7,958 MiB → 0,378 MiB, mantendo a geometria e convertendo seis PNG 1024 para WebP 512.
- Castelo: 3,123 MiB → 0,502 MiB, mantendo os 97.139 triângulos e aplicando Meshopt/prune/weld.
- Logo e três ícones: ~6,27 MiB → ~0,26 MiB em WebP lossless dimensionado para a UI.
- Todos os GLBs ativos e os assets de UI usados receberam versão por hash na URL.
- Cache longo e imutável foi configurado somente para famílias de assets estáticos versionados; `index.html` não recebe a regra.
- Debug mobile saiu do bundle principal e é importado dinamicamente apenas com `?debugMobile=1`.
- Vídeos continuam apenas com poster na abertura do painel; o MP4 e `preload="none"` são criados somente após clique.
- Uma única instalação de `three@0.180.0`; nenhum Three.js duplicado.
- DPR mobile continua limitado a 1,25; árvores, bode, mago e fogueira não projetam sombras dinâmicas.

## Auditoria GLB ativa depois

- 14 GLBs ativos, sem downloads por instância de árvore.
- Total estático: **27,448 MiB** (redução de 10,200 MiB / 27,1%).
- Acima de 5 MiB: somente `templo.web.glb` (6,90 MiB).
- Acima de 10 MiB: nenhum.
- Acima de 20 MiB: nenhum.
- Relatório completo de meshes, triângulos, materiais e texturas: `reports/glb-audit.after.md`.

## Bundle

| Bundle | Antes | Depois local |
|---|---:|---:|
| JS principal (minificado) | 708,81 kB | 705,93 kB |
| JS principal (gzip) | 190,65 kB | 190,05 kB |
| Debug mobile | incluído no principal | chunk separado: 5,00 kB / 2,14 kB gzip |

## Resultado depois

A preencher com o cold load público do Preview da Vercel desta branch antes da entrega final.
