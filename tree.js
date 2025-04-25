// ====== CONFIG ======
const CONFIG = {
    margin: { top: 20, right: 90, bottom: 20, left: 90 },
    nodeWidth: 120,
    nodeHeight: 60,
    xSpacing: 120 * 1.2,
    ySpacing: 60 * 1.5,
    dragThreshold: 50
};

// ====== DATA ======
const data = {
    name: '根節點',
    children: [
        {
            name: '節點 1',
            children: [
                { name: '子節點 1.1', children: [{ name: '節點 1.1.1' }, { name: '節點 1.1.2' }] },
                { name: '子節點 1.2', children: [{ name: '節點 1.2.1' }] },
                { name: '子節點 1.3' }
            ]
        },
        {
            name: '節點 2',
            children: [
                { name: '子節點 2.1' },
                { name: '子節點 2.2' }
            ]
        },
        {
            name: '節點 3',
            children: [
                { name: '子節點 3.1' },
                { name: '子節點 3.2' },
                { name: '子節點 3.3' }
            ]
        }
    ]
};

// ====== INITIALIZATION ======
let selectedNode = null;

window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('tree-container');
    const { width, height } = container.getBoundingClientRect();

    // Setup SVG and zoom
    const svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%');

    const g = svg.append('g')
        .attr('transform', `translate(${CONFIG.margin.left},${CONFIG.margin.top})`);

    const zoom = d3.zoom()
        .on('zoom', event => g.attr('transform', event.transform));
    svg.call(zoom);

    // Initial tree drawing
    let treeData = drawTree(g, svg);

    // Center initial view
    const xExtent = d3.extent(treeData.descendants(), d => d.x);
    const yExtent = d3.extent(treeData.descendants(), d => d.y);
    const treeCenterX = (xExtent[0] + xExtent[1]) / 2;
    const treeCenterY = (yExtent[0] + yExtent[1]) / 2;
    const offsetX = width / 2 - treeCenterX;
    const offsetY = height / 2 - treeCenterY;

    const initialTransform = d3.zoomIdentity
        .translate(offsetX, offsetY)
        .scale(0.8);
    svg.call(zoom.transform, initialTransform);

    // Setup buttons
    setupButtons(g, svg, zoom);
});

// ====== UTILITY FUNCTIONS ======
function customLink(d, radius = 15) {
    const { x: x0, y: y0 } = d.source;
    const { x: x1, y: y1 } = d.target;
    const midY = (y0 + y1) / 2;

    if (Math.abs(x0 - x1) < 1) return `M ${x0},${y0} L ${x1},${y1}`;

    const curveRight = x0 < x1;
    return `M ${x0},${y0}
        L ${x0},${midY - radius}
        Q ${x0},${midY} ${curveRight ? x0 + radius : x0 - radius},${midY}
        L ${curveRight ? x1 - radius : x1 + radius},${midY}
        Q ${x1},${midY} ${x1},${midY + radius}
        L ${x1},${y1}`;
}

function findNearestParent(node, allNodes, threshold = CONFIG.dragThreshold) {
    let nearestParent = null;
    let minDistance = Infinity;

    allNodes.forEach(potentialParent => {
        if (potentialParent === node || potentialParent === node.parent) return;

        const distance = Math.sqrt(
            Math.pow(node.x - potentialParent.x, 2) +
            Math.pow(node.y - potentialParent.y, 2)
        );

        if (distance < threshold && distance < minDistance) {
            minDistance = distance;
            nearestParent = potentialParent;
        }
    });

    return nearestParent;
}

function updateNodeParent(node, newParent) {
    if (node.parent) {
        const index = node.parent.data.children.indexOf(node.data);
        if (index > -1) {
            node.parent.data.children.splice(index, 1);
        }
    }

    if (!newParent.data.children) {
        newParent.data.children = [];
    }
    newParent.data.children.push(node.data);
    node.parent = newParent;
}

function reorderSiblings(node, event, treeData) {
    const siblings = node.parent.data.children;
    const currentIndex = siblings.indexOf(node.data);

    const siblingPositions = siblings.map((sibling, index) => {
        const node = treeData.descendants().find(n => n.data === sibling);
        return {
            index,
            x: node ? node.x : 0
        };
    });

    siblingPositions.sort((a, b) => a.x - b.x);
    let insertIndex = siblingPositions.findIndex(pos => event.x <= pos.x);
    if (insertIndex === -1) {
        insertIndex = siblings.length;
    }

    if (insertIndex !== currentIndex) {
        siblings.splice(currentIndex, 1);
        siblings.splice(insertIndex, 0, node.data);
    }
}

// ====== DRAG BEHAVIOR ======
function createDragBehavior(treeData, containerGroup, drawTree) {
    let isDragging = false;
    let startX, startY;

    return d3.drag()
        .on('start', function (event, d) {
            startX = event.x;
            startY = event.y;
            isDragging = false;
        })
        .on('drag', function (event, d) {
            // 計算移動距離
            const distance = Math.sqrt(Math.pow(event.x - startX, 2) + Math.pow(event.y - startY, 2));

            // 如果移動距離超過閾值，則視為拖曳
            if (distance > 5) {
                isDragging = true;
                d3.select(this).raise();
                d3.select(this)
                    .attr('transform', `translate(${event.x},${event.y})`);

                d.x = event.x;
                d.y = event.y;

                containerGroup.selectAll('.link')
                    .attr('d', d => customLink(d));
            }
        })
        .on('end', function (event, d) {
            if (isDragging) {
                const newParent = findNearestParent(d, treeData.descendants());

                if (newParent && newParent !== d.parent) {
                    updateNodeParent(d, newParent);
                } else if (d.parent) {
                    reorderSiblings(d, event, treeData);
                }

                drawTree(containerGroup, d3.select('svg'));
            }
        });
}

// ====== TREE LAYOUT ======
function createTreeLayout() {
    return d3.tree()
        .nodeSize([CONFIG.xSpacing, CONFIG.ySpacing])
        .separation((a, b) => a.parent === b.parent ? 1 : 2);
}

function getTreeData() {
    const root = d3.hierarchy(data);
    return createTreeLayout()(root);
}

// ====== TREE RENDERING ======
function drawTree(containerGroup, svg) {
    containerGroup.selectAll('.link').remove();
    containerGroup.selectAll('.node').remove();

    const treeData = getTreeData();

    // Draw links
    containerGroup.selectAll('.link')
        .data(treeData.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d => customLink(d));

    // Draw nodes
    const node = containerGroup.selectAll('.node')
        .data(treeData.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('cursor', 'pointer')
        .call(createDragBehavior(treeData, containerGroup, drawTree))
        .on('click', function (event, d) {
            // 只有在不是拖曳的情況下當作點擊
            if (!event.defaultPrevented) {
                selectedNode = d;
                updateNodeSelection(containerGroup);
                updateButtonStates();
                event.stopPropagation();
            }
        });

    node.append('rect')
        .attr('x', -CONFIG.nodeWidth / 2)
        .attr('y', -CONFIG.nodeHeight / 2)
        .attr('width', CONFIG.nodeWidth)
        .attr('height', CONFIG.nodeHeight)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', 'white')
        .attr('stroke', '#4CAF50')
        .attr('stroke-width', '1.5px');

    node.append('text')
        .attr('dy', '.31em')
        .attr('x', 0)
        .attr('y', 0)
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'middle')
        .text(d => d.data.name);

    // Click outside to deselect
    svg.on('click', () => {
        selectedNode = null;

        updateNodeSelection(containerGroup);
        updateButtonStates();
    });

    // Restore selection if exists
    if (selectedNode) {
        d3.selectAll('g.node')
            .filter(d => d === selectedNode)
            .select('rect')
            .attr('stroke', '#FFD700');
    }

    return treeData;
}

// ====== UI UPDATES ======
function updateNodeSelection(containerGroup) {
    containerGroup.selectAll('.node rect')
        .attr('stroke', '#4CAF50');

    if (selectedNode) {

        d3.selectAll('g.node')
            .filter(d => d === selectedNode)
            .select('rect')
            .attr('stroke', '#FFD700');
    }
}

function updateButtonStates() {
    const createBtn = document.getElementById('create');
    const editBtn = document.getElementById('edit');
    const deleteBtn = document.getElementById('delete');

    createBtn.disabled = !selectedNode;
    editBtn.disabled = !selectedNode;
    deleteBtn.disabled = !selectedNode || !selectedNode.parent;
}

// ====== BUTTON HANDLERS ======
function setupButtons(g, svg, zoom) {
    // Extend button
    document.getElementById('extend').addEventListener('click', () => {
        const nodes = getTreeData().descendants();
        const padding = 50;
        const container = document.getElementById('tree-container');
        const { width, height } = container.getBoundingClientRect();

        const xExtent = d3.extent(nodes, d => d.x);
        const yExtent = d3.extent(nodes, d => d.y);

        const treeWidth = xExtent[1] - xExtent[0] + CONFIG.nodeWidth + padding * 2;
        const treeHeight = yExtent[1] - yExtent[0] + CONFIG.nodeHeight + padding * 2;

        const scaleX = width / treeWidth;
        const scaleY = height / treeHeight;
        const scale = Math.min(scaleX, scaleY, 1);

        const centerX = (xExtent[0] + xExtent[1]) / 2;
        const centerY = (yExtent[0] + yExtent[1]) / 2;

        const translateX = width / 2 - centerX * scale;
        const translateY = height / 2 - centerY * scale;

        const transform = d3.zoomIdentity
            .translate(translateX, translateY)
            .scale(scale);

        svg.transition()
            .duration(750)
            .call(zoom.transform, transform);
    });

    // Modal setup
    const nodeModal = document.getElementById('nodeModal');
    const modalTitle = document.getElementById('modalTitle');
    const nodeNameInput = document.getElementById('nodeName');
    const confirmButton = document.getElementById('confirmButton');
    let modalMode = '';

    // Create button
    document.getElementById('create').addEventListener('click', () => {
        modalMode = 'create';
        modalTitle.textContent = '新增節點';
        nodeModal.style.display = 'block';
        nodeNameInput.value = '';
        confirmButton.disabled = true;
    });

    // Edit button
    document.getElementById('edit').addEventListener('click', () => {
        modalMode = 'edit';
        modalTitle.textContent = '編輯節點';
        nodeModal.style.display = 'block';
        nodeNameInput.value = selectedNode.data.name;
        confirmButton.disabled = false;
    });

    // Delete button
    document.getElementById('delete').addEventListener('click', () => {
        if (selectedNode && selectedNode.parent) {
            const index = selectedNode.parent.data.children.indexOf(selectedNode.data);
            if (index > -1) {
                selectedNode.parent.data.children.splice(index, 1);
                if (selectedNode.parent.data.children.length === 0) {
                    delete selectedNode.parent.data.children;
                }
                selectedNode = null;
                drawTree(g, svg);
                updateButtonStates();
            }
        }
    });

    // Modal input handler
    nodeNameInput.addEventListener('input', () => {
        confirmButton.disabled = !nodeNameInput.value.trim();
    });

    // Modal close handler
    window.closeModal = () => {
        nodeModal.style.display = 'none';
        modalMode = '';
    };

    // Modal outside click handler
    nodeModal.addEventListener('click', (event) => {
        if (event.target === nodeModal) {
            closeModal();
        }
    });

    // Modal confirm handler
    confirmButton.addEventListener('click', () => {
        const newNodeName = nodeNameInput.value.trim();

        if (modalMode === 'create') {
            if (selectedNode) {
                if (!selectedNode.data.children) {
                    selectedNode.data.children = [];
                }
                selectedNode.data.children.push({ name: newNodeName });
                drawTree(g, svg);
            }
        } else if (modalMode === 'edit') {
            selectedNode.data.name = newNodeName;
            drawTree(g, svg);
        }

        closeModal();
    });
}


