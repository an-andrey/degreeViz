export function setupHistory(network, nodes, edges, markGraphDirty) {
  let undoStack = [];
  let redoStack = [];

  function saveGraphState() {
    const currentPositions = network.getPositions();
    const currentNodes = nodes.get().map((n) => {
      if (currentPositions[n.id]) {
        n.x = currentPositions[n.id].x;
        n.y = currentPositions[n.id].y;
      }
      return { ...n };
    });
    const currentEdges = edges.get().map((e) => ({ ...e }));

    undoStack.push({ nodes: currentNodes, edges: currentEdges });
    redoStack = [];
    updateUndoRedoButtons();
  }

  function performWithoutHistory(action) {
    nodes.off("add", saveGraphState);
    nodes.off("remove", saveGraphState);
    nodes.off("update", saveGraphState);
    edges.off("add", saveGraphState);
    edges.off("remove", saveGraphState);

    action();

    nodes.on("add", saveGraphState);
    nodes.on("remove", saveGraphState);
    nodes.on("update", saveGraphState);
    edges.on("add", saveGraphState);
    edges.on("remove", saveGraphState);
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");
    if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function triggerHistoryAction(isUndo) {
    const stack = isUndo ? undoStack : redoStack;
    const targetStack = isUndo ? redoStack : undoStack;

    if (stack.length > (isUndo ? 1 : 0)) {
      targetStack.push(isUndo ? stack.pop() : stack.pop());
      const state = isUndo
        ? stack[stack.length - 1]
        : targetStack[targetStack.length - 1];

      performWithoutHistory(() => {
        nodes.clear();
        edges.clear();
        nodes.add(state.nodes);
        edges.add(state.edges);
      });

      updateUndoRedoButtons();
      markGraphDirty();
    }
  }

  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn)
    undoBtn.addEventListener("click", () => triggerHistoryAction(true));

  const redoBtn = document.getElementById("redoBtn");
  if (redoBtn)
    redoBtn.addEventListener("click", () => triggerHistoryAction(false));

  // Initialize
  performWithoutHistory(() => {});
  setTimeout(saveGraphState, 500);

  return { performWithoutHistory, saveGraphState };
}
