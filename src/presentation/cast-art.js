export function castPortraitSvg(caseId, id, expression = 'focused') {
  const known = new Set([
    'case-02:chen', 'case-02:mina', 'case-02:agent',
    'case-03:agai', 'case-03:mei', 'case-03:zhou',
    'case-04:wei', 'case-04:hui', 'case-04:lamp',
  ]);
  const key = known.has(`${caseId}:${id}`) ? `${caseId}:${id}` : 'case-02:agent';
  const asset = key.replace('case-', 'case').replace(':', '-');
  const mood = ['worried', 'alarmed'].includes(expression)
    ? 'worried'
    : expression === 'skeptical'
      ? 'skeptical'
      : ['bright', 'relieved'].includes(expression)
        ? 'relieved'
        : 'focused';
  return `<span class="scene-portrait cast-sprite cast-${asset} expression-${mood}" style="--portrait-image:url('./assets/art/characters/${asset}-${mood}.png')" aria-hidden="true"></span>`;
}
