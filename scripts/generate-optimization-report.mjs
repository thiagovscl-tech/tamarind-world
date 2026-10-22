import fs from 'node:fs/promises';
import path from 'node:path';

const reportDir = path.resolve('reports');
const optimization = JSON.parse(await fs.readFile(path.join(reportDir, 'glb-optimization.json'), 'utf8'));
const beforeAudit = JSON.parse(await fs.readFile(path.join(reportDir, 'glb-audit.before.json'), 'utf8'));
const afterAudit = JSON.parse(await fs.readFile(path.join(reportDir, 'glb-audit.after.json'), 'utf8'));
const beforeByName = new Map(beforeAudit.map((item) => [item.name, item]));
const afterByName = new Map(afterAudit.map((item) => [item.name, item]));

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const rows = optimization.map((item) => {
  const before = beforeByName.get(item.input);
  const after = afterByName.get(item.output);
  return `| ${item.input} | ${mb(item.before)} MB | ${mb(item.after)} MB | ${mb(item.reduction)} MB | ${item.reductionPercent.toFixed(1)}% | ${before?.triangles.toLocaleString('pt-BR') ?? '—'} | ${after?.triangles.toLocaleString('pt-BR') ?? '—'} | ${before?.textures.length ?? '—'} | ${after?.textures.length ?? '—'} |`;
});
const beforeTotal = optimization.reduce((sum, item) => sum + item.before, 0);
const afterTotal = optimization.reduce((sum, item) => sum + item.after, 0);
const reduction = beforeTotal - afterTotal;
const reductionPercent = (1 - afterTotal / beforeTotal) * 100;

const markdown = `# Tamarind — otimização web dos GLBs\n\n## Resumo\n\n- Total original ativo: **${mb(beforeTotal)} MB**\n- Total otimizado: **${mb(afterTotal)} MB**\n- Redução: **${mb(reduction)} MB (${reductionPercent.toFixed(1)}%)**\n- Geometria: Meshopt em todos os GLBs; simplificação moderada apenas no castelo distante e nas árvores instanciadas.\n- Texturas: WebP, com limite por categoria; originais mantidos para rollback.\n\n## Antes x depois\n\n| GLB | antes | depois | redução | redução % | triângulos antes | triângulos depois | texturas antes | texturas depois |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n## Medição local do carregamento\n\n| métrica | antes | depois | variação |\n|---|---:|---:|---:|\n| mundo completo | 25,12 s | 19,76 s | -21,3% |\n| primeiro render após a ilha crítica | ~143 ms | ~142 ms | estável |\n| payload potencial dos 9 GLBs ativos | 399,14 MB | 48,08 MB | -88,0% |\n\nMedição feita no servidor Vite local. Cache e velocidade de disco local reduzem os tempos de request; a queda de payload é o indicador mais representativo para a Vercel.\n\n## Faixa costeira\n\nA amostragem de terreno foi movida para desenvolvimento/build. O navegador carrega \`public/artwork/data/coastline.web.json\` e apenas monta quatro geometrias leves, preservando shaders e materiais atuais.\n`;

await fs.writeFile(path.join(reportDir, 'optimization-summary.md'), markdown);
console.log(markdown);
