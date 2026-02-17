let root, svg, g, tree;
const width = window.innerWidth, height = window.innerHeight;
let i = 0;

// Initialize SVG & Center it immediately
svg = d3.select("#mindmap")
    .attr("width", width).attr("height", height)
    .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)))
    .append("g");

g = svg.append("g");
// Using a vertical layout: [Horizontal Spacing, Vertical Spacing]
tree = d3.tree().nodeSize([200, 160]);

// Load data and render the tree
d3.json("/api/data").then(data => {
    root = d3.hierarchy(data);

    // Populate Dropdowns
    const orgs = new Set();
    const teams = new Set();
    
    root.descendants().forEach(d => {
        if (d.data.type === 'org') orgs.add(d.data.name);
        if (d.data.type === 'team') teams.add(d.data.name);
    });

    const orgSelect = document.getElementById('org-filter');
    orgs.forEach(org => orgSelect.add(new Option(org, org)));

    const teamSelect = document.getElementById('team-filter');
    teams.forEach(team => teamSelect.add(new Option(team, team)));

    root.x0 = 0; root.y0 = 0;
    // Collapse all nodes initially
    if (root.children) root.children.forEach(collapseAll);

    update(root);
    resetView();
});

// Helper: Collapse logic
function collapseAll(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapseAll);
        d.children = null;
    }
}

// Helper: Force expansion of a single node
function expandNode(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
}

// Search on Enter - Recursive Expansion Logic
// document.getElementById('search-input').addEventListener('keydown', function (e) {
//     if (e.key === 'Enter') {
//         const term = this.value.toLowerCase().trim();
//         const countBadge = document.getElementById('match-count');

//         // Reset highlights and badge
//         g.selectAll(".node").classed("highlight", false);
//         countBadge.innerText = "";
//         countBadge.style.display = "none";

//         if (!term) return;

//         let matches = [];

//         // 1. Recursive Deep Search (checks hidden _children)
//         function searchAll(d) {
//             if (d.data.name.toLowerCase().includes(term)) {
//                 matches.push(d);
//             }
//             const children = d.children || d._children;
//             if (children) children.forEach(searchAll);
//         }
//         searchAll(root);

//         // 2. Update the Sidebar Match Count
//         if (matches.length > 0) {
//             countBadge.innerText = `${matches.length} found`;
//             countBadge.style.display = "inline-block";

//             // 3. Expand the path to every match
//             matches.forEach(d => {
//                 let curr = d;
//                 while (curr.parent) {
//                     if (curr.parent._children) {
//                         curr.parent.children = curr.parent._children;
//                         curr.parent._children = null;
//                     }
//                     curr = curr.parent;
//                 }
//             });

//             // 4. Redraw tree and focus
//             update(root);

//             setTimeout(() => {
//                 g.selectAll(".node").classed("highlight", d =>
//                     d.data.name.toLowerCase().includes(term)
//                 );
//                 // Center on the first result
//                 centerOnNode(matches[0]);
//             }, 500);

//         } else {
//             countBadge.innerText = "0 found";
//             countBadge.style.display = "inline-block";
//             alert("No matches found.");
//         }
//     }
// });

document.getElementById('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        const term = this.value.toLowerCase().trim();
        const selectedOrg = document.getElementById('org-filter').value;
        const selectedTeam = document.getElementById('team-filter').value;
        const countBadge = document.getElementById('match-count');

        g.selectAll(".node").classed("highlight", false);
        if (!term && selectedOrg === 'all' && selectedTeam === 'all') return;

        let matches = [];

        function searchAll(d) {
            let isMatch = true;
            const nameMatch = d.data.name.toLowerCase().includes(term);
            
            // Check Org/Team Hierarchy
            if (selectedOrg !== 'all' || selectedTeam !== 'all') {
                let pathNames = d.ancestors().map(a => a.data.name);
                if (selectedOrg !== 'all' && !pathNames.includes(selectedOrg)) isMatch = false;
                if (selectedTeam !== 'all' && !pathNames.includes(selectedTeam)) isMatch = false;
            }

            if (nameMatch && isMatch) {
                matches.push(d);
            }
            
            const children = d.children || d._children;
            if (children) children.forEach(searchAll);
        }

        searchAll(root);

        if (matches.length > 0) {
            countBadge.innerText = `${matches.length} found`;
            countBadge.style.display = "inline-block";

            matches.forEach(d => {
                let curr = d;
                while (curr.parent) {
                    if (curr.parent._children) {
                        curr.parent.children = curr.parent._children;
                        curr.parent._children = null;
                    }
                    curr = curr.parent;
                }
            });

            update(root);
            setTimeout(() => {
                g.selectAll(".node").classed("highlight", d => matches.includes(d));
                centerOnNode(matches[0]);
            }, 500);
        } else {
            countBadge.innerText = "0 found";
            countBadge.style.display = "inline-block";
        }
    }
});

/**
 * Helper: Centers the SVG view on a specific node
 * Since the tree is vertical and can be large, we translate the 'g' 
 * container so the target node is at a comfortable viewing height.
 */
function centerOnNode(d) {
    const scale = d3.zoomTransform(svg.node()).k;
    const x = width / 2 - d.x * scale;
    const y = 150 - d.y * scale; // Adjust 150 to set how far from top it appears

    svg.transition()
        .duration(750)
        .call(d3.zoom().transform, d3.zoomIdentity.translate(x, y).scale(scale));
}






// ... (keep the rest of your update and diagonal functions) ...

// Main update function for rendering the tree
function update(source) {
    const nodes = tree(root).descendants();
    const links = nodes.slice(1);
    const node = g.selectAll('g.node').data(nodes, d => d.id || (d.id = ++i));

    // Enter new nodes at the parent's previous position
    const nodeEnter = node.enter().append('g')
        .attr('class', d => `node node-${d.data.type}`)
        .attr("transform", d => `translate(${source.x0},${source.y0})`)
        .on('click', (event, d) => {
            // FIX: This must be inside the update loop to have access to 'd'
            showDetails(d);

            if (d.children) { d._children = d.children; d.children = null; }
            else { expandNode(d); }
            update(d);
        });

    nodeEnter.append('circle').attr('r', 10);
    nodeEnter.append('text').attr("dy", ".35em").attr("y", 30).attr("text-anchor", "middle")
        .text(d => d.data.name);

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(500).attr("transform", d => `translate(${d.x},${d.y})`);
    nodeUpdate.select('circle').style("fill", d => d._children ? "#3182ce" : "#fff");

    node.exit().transition().duration(500).attr("transform", d => `translate(${source.x},${source.y})`).remove();

    const link = g.selectAll('path.link').data(links, d => d.id);
    const linkEnter = link.enter().insert('path', "g").attr("class", "link")
        .attr('d', d => { const o = { x: source.x0, y: source.y0 }; return diagonal(o, o); });

    linkEnter.merge(link).transition().duration(500).attr('d', d => diagonal(d, d.parent));
    link.exit().transition().duration(500).attr('d', d => diagonal(source, source)).remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

// Helper: Diagonal path generator for links
function diagonal(s, d) {
    return `M ${s.x} ${s.y} C ${s.x} ${(s.y + d.y) / 2}, ${d.x} ${(s.y + d.y) / 2}, ${d.x} ${d.y}`;
}

// SIDEBAR UPDATE LOGIC
function showDetails(d) {
    const infoContent = document.getElementById('info-content');
    let html = `<h4>${d.data.name}</h4><p>Type: <span class="badge">${d.data.type}</span></p>`;

    if (d.data.type === 'application' && d.data.sequence) {
        html += `<div class="sequence-box">
                    <strong>End-to-End Flow (ID: ${d.data.flowId}):</strong>`;

        html += d.data.sequence.map((name, idx) => `
            <div class="flow-step ${name === d.data.name ? 'highlight-step' : ''}">
                <span class="step-num">${idx + 1}</span> ${name}
            </div>
        `).join('');
        html += `</div>`;
    } else {
        html += `<p class="placeholder">Select an application to view its specific data flow sequence.</p>`;
    }

    infoContent.innerHTML = html;
}



// VIEW CONTROLS
function resetView() {
    d3.select("#mindmap")
        .call(d3.zoom().transform, d3.zoomIdentity.translate(width / 2, 80).scale(1));
}

// TOGGLE SIDEBAR
document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});