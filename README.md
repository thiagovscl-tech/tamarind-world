# Tamarind World

Cena Three.js e ferramentas de preparação para converter a arte original em um mundo 2.5D/3D.

## Executar

```sh
npm install
npm run dev
```

O editor de máscaras fica em `/tools/mask-studio.html`.

## Arquitetura espacial

`public/artwork/world-layers.json` é a fonte dos elementos, caixas de referência normalizadas, grupos de cena, Z independente e modo de representação. A câmera olha do eixo +Z para a composição; valores Z maiores ficam mais perto. O mapa de profundidade codifica o intervalo de Z em 16 bits, com valores mais claros mais próximos.

| Elemento | Representação proposta |
| --- | --- |
| Céu e sol | Planos 2.5D independentes; o sol fica atrás das montanhas que o ocluem. |
| Dragão | Recorte 2.5D, mantendo o desenho e a silhueta originais. |
| Montanhas distantes | Malha rasa guiada pelo depth map e texturizada com pixels da arte. |
| Montanhas intermediárias | Malhas de terreno de baixa complexidade, guiadas por máscaras e profundidade local. |
| Castelo | Geometria arquitetônica simplificada; volumes principais em 3D, detalhes e cor vindos da textura original. |
| Cachoeiras | Faixas texturizadas curvas e rasas, separadas por queda. |
| Pontes | Arcos 3D simplificados, texturizados com recortes da fonte. |
| Vegetação e elementos intermediários | Grupos de planos recortados em profundidades diferentes. |
| Tecnomago, Guardiã, Explorador e Urso | Recortes 2.5D independentes; sem rig ou animação nesta etapa. |
| Primeiro plano | Malha de relevo rasa para rochas/terreno; folhagem em planos agrupados. |

As máscaras são extraídas manualmente, não geradas por IA. O arquivo-fonte é somente leitura. A reconstrução de clean plates está suspensa; nenhum clean plate é usado na cena principal. Onde há sobreposição real, serão criadas submáscaras ou zonas de profundidade local, em vez de forçar uma única ordem Z para a paisagem inteira.

## Preparar máscaras e profundidade

1. Abra `/tools/mask-studio.html` e alterne entre `ORIGINAL`, `MÁSCARA`, `OVERLAY` e `TODAS`. `TODAS` mostra a composição colorida das 12 máscaras. O zoom chega a 500% para inspeção de bordas.
2. Ao revisar uma camada, exporte `id.png` e salve em `public/artwork/masks/` com o ID selecionado. A fonte mede 1672 × 941. Os PNGs de máscara seguem o pedido de 1672 × 944: os três pixels extras abaixo da área da imagem ficam pretos, sem redimensionar a fonte.
3. Rode `npm run masks:normalize` após salvar exportações editadas para garantir PNG grayscale de canal único. `npm run masks:validate` aponta máscaras ausentes, vazias ou com dimensões incorretas.
4. O depth map final está deliberadamente adiado. O script de composição continua disponível para uma etapa futura, mas não foi executado agora.

As máscaras atuais são traçados manuais iniciais aproximados, exportados como PNG grayscale (`L`). `python scripts/create_initial_masks.py` as cria apenas se ainda não existirem; `--force` é necessário para substituir arquivos que possam conter revisão manual. O gerador não preenche áreas ocultas. Gere a prévia simultânea com `python scripts/render_all_masks_preview.py`; ela é um artefato de inspeção e não modifica as máscaras nem a fonte.

As máscaras e os scripts só geram arquivos derivados. Eles não alteram nem sobrescrevem `public/artwork/source/layoutTamarind.png`.

`python scripts/refine_visible_masks.py` aplica recortes manuais fixos nas áreas das placas de texto e normaliza as máscaras para grayscale `L`, 1672 × 944. Não usa segmentação baseada em cor/modelo nem preenche regiões ocultas. `python scripts/render_all_masks_preview.py` cria a prévia em cores e assinala pixels compartilhados em amarelo.

## Recorte RGBA para Hunyuan3D

`npm run cutout:technomage` exporta somente os pixels do Tecnomago usando a máscara existente, sem IA, reconstrução, filtro ou edição da arte/máscara. O PNG RGBA mantém a resolução original de 1672 × 941 e os pixels RGB originais; a máscara fornece o canal alfa.

Arquivo gerado: `public/artwork/cutouts/tecnomago.png`. Este asset é apenas para teste Image-to-3D no ComfyUI/Hunyuan3D e ainda não está conectado à cena Three.js.

As sete máscaras críticas desta rodada recebem silhuetas vetoriais manuais em `scripts/refine_visible_masks.py`. Gere uma prancha focada nelas com `python scripts/render_all_masks_preview.py --critical`. Os arcos da ponte são furos explícitos; as máscaras de ponte são recortadas pelas figuras à frente, e as cachoeiras pela ponte e pela placa que as oclui.

## Teste espacial 2.5D

A página `/` mantém a arte fonte como placa de fundo e sobrepõe planos de textura alfa para Tecnomago, Guardiã, Explorador, Urso, Castelo, Ponte e Cachoeiras. Cada plano usa a máscara atual e o Z independente definido em `world-layers.json`; nenhuma geometria 3D de personagem é criada. Como não há clean plate, mover a câmera pode revelar duplicação dos pixels originais que continuam impressos na placa de fundo. Esse artefato é esperado neste teste.

Mova o mouse sobre a cena para deslocar e inclinar suavemente a câmera, use a roda para aproximar/afastar em limites curtos, e desative `Auto` para parar o movimento ambiente. `Recentralizar` retorna a profundidade e o ponteiro ao repouso.

## Estado

- A imagem fonte está em `public/artwork/source/layoutTamarind.png` como cópia sem reprocessamento.
- A composição original continua no plano de referência Three.js em textura sRGB.
- Sete planos mascarados têm posição Z independente e câmera perspectiva com deslocamento limitado, inclinação curta e auto-movimento opcional.
- O clean plate, o mapa de profundidade e geometrias 3D continuam adiados.
