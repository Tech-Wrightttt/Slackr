/**
 * Shows single line breaks the way the vault's authors see them in Obsidian: a newline inside a paragraph
 * becomes a <br>. Without it, Markdown joins the lines, so "(i) ... (ii) ..." lists and a formula on its own
 * line run into the sentence before them. Only plain text is touched, never code or math.
 */
type MdNode = { type: string; value?: string; children?: MdNode[] };

const splitText = (node: MdNode): MdNode[] => {
  const parts = (node.value ?? '').split(/\r?\n/);
  if (parts.length === 1) return [node];
  return parts.flatMap((value, i) => (i === 0 ? [{ type: 'text', value }] : [{ type: 'break' }, { type: 'text', value }]));
};

const walk = (node: MdNode) => {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => (child.type === 'text' ? splitText(child) : (walk(child), [child])));
};

export const remarkLineBreaks = () => (tree: MdNode) => walk(tree);
