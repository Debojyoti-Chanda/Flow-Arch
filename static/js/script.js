let root, svg, g, tree;
const width = window.innerWidth, height = window.innerHeight;
let i = 0;

svg = d3.select("#mindmap")
    .attr("width", width).attr("height", height)
    .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)))
    .append("g");

g = svg.append("g");
tree = d3.tree().nodeSize([220, 180]); // Adjusted spacing for labels

d3.json("/api/data").then(data => {
    root = d3.hierarchy(data);

    // Build org->teams map
    const orgs = new Set();
    const teams = new Set();
    const orgTeamsMap = {};
    root.descendants().forEach(d => {
        if (d.data.type === 'org') {
            orgs.add(d.data.name);
            // Find teams under this org
            const teamsUnderOrg = [];
            d.children && d.children.forEach(child => {
                if (child.data.type === 'team') teamsUnderOrg.push(child.data.name);
                // Also handle sub-orgs recursively
                if (child.data.type === 'sub-org' && child.children) {
                    child.children.forEach(grandchild => {
                        if (grandchild.data.type === 'team') teamsUnderOrg.push(grandchild.data.name);
                    });
                }
            });
            orgTeamsMap[d.data.name] = teamsUnderOrg;
        }
        if (d.data.type === 'team') teams.add(d.data.name);
    });

    const orgSelect = document.getElementById('org-filter');
    orgs.forEach(org => orgSelect.add(new Option(org, org)));
    const teamSelect = document.getElementById('team-filter');
    function populateTeams(selectedOrg) {
        // Remove all except the first option
        while (teamSelect.options.length > 1) teamSelect.remove(1);
        if (selectedOrg === 'all') {
            teams.forEach(team => teamSelect.add(new Option(team, team)));
        } else {
            (orgTeamsMap[selectedOrg] || []).forEach(team => teamSelect.add(new Option(team, team)));
        }
    }
    // Initial population: all teams
    populateTeams('all');

    orgSelect.addEventListener('change', function() {
        populateTeams(this.value);
        // Reset team filter to 'all' when org changes
        teamSelect.value = 'all';
    });

    root.x0 = 0; root.y0 = 0;
    if (root.children) root.children.forEach(collapseAll);

    update(root);
    resetView();
});

function collapseAll(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapseAll);
        d.children = null;
    }
}

function expandNode(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
}

// Search & Filter Logic
document.getElementById('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        const term = this.value.toLowerCase().trim();
        const selectedOrg = document.getElementById('org-filter').value;
        const selectedTeam = document.getElementById('team-filter').value;
        const countBadge = document.getElementById('match-count');

        g.selectAll(".node").classed("highlight", false);
        if (!term && selectedOrg === 'all' && selectedTeam === 'all') return;

        // Helper: Collapse all nodes in the tree
        function collapseAllDeep(d) {
            if (d.children) {
                d.children.forEach(collapseAllDeep);
                d._children = d.children;
                d.children = null;
            } else if (d._children) {
                d._children.forEach(collapseAllDeep);
            }
        }

        // Helper: Expand ancestors of a node
        function expandAncestors(d) {
            if (d.parent) {
                expandNode(d.parent);
                expandAncestors(d.parent);
            }
        }

        // Collapse everything before searching
        collapseAllDeep(root);

        let matches = [];
        function searchAll(d) {
            let isMatch = true;
            const nameMatch = d.data.name.toLowerCase().includes(term);

            if (selectedOrg !== 'all' || selectedTeam !== 'all') {
                let pathNames = d.ancestors().map(a => a.data.name);
                if (selectedOrg !== 'all' && !pathNames.includes(selectedOrg)) isMatch = false;
                if (selectedTeam !== 'all' && !pathNames.includes(selectedTeam)) isMatch = false;
            }

            if (nameMatch && isMatch) matches.push(d);
            const children = d.children || d._children;
            if (children) children.forEach(searchAll);
        }

        searchAll(root);

        if (matches.length > 0) {
            countBadge.innerText = `${matches.length} found`;
            countBadge.style.display = "inline-block";
            // Expand only the ancestors of matching nodes
            matches.forEach(d => {
                expandAncestors(d);
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

function update(source) {
    const nodes = tree(root).descendants();
    const links = nodes.slice(1);
    const node = g.selectAll('g.node').data(nodes, d => d.id || (d.id = ++i));

    const nodeEnter = node.enter().append('g')
        .attr('class', d => `node node-${d.data.type}`)
        .attr("transform", d => `translate(${source.x0 || 0},${source.y0 || 0})`)
        .on('click', (event, d) => {
            showDetails(d);
            // Collapse all siblings when expanding/collapsing a node
            if (d.parent && d.parent.children) {
                d.parent.children.forEach(sibling => {
                    if (sibling !== d) {
                        // Collapse sibling
                        if (sibling.children) {
                            sibling._children = sibling.children;
                            sibling._children.forEach(collapseAll);
                            sibling.children = null;
                        }
                    }
                });
            }
            if (d.children) { d._children = d.children; d.children = null; }
            else { expandNode(d); }
            update(d);
        });

    nodeEnter.append('circle').attr('r', 12);
    nodeEnter.append('text').attr("dy", ".35em").attr("y", 30).attr("text-anchor", "middle")
        .text(d => d.data.name);

    const nodeUpdate = nodeEnter.merge(node);
    nodeUpdate.transition().duration(500).attr("transform", d => `translate(${d.x},${d.y})`);
    nodeUpdate.select('circle').style("fill", d => d._children ? "var(--primary)" : "#fff");

    node.exit().transition().duration(500).attr("transform", d => `translate(${source.x},${source.y})`).remove();

    const link = g.selectAll('path.link').data(links, d => d.id);
    const linkEnter = link.enter().insert('path', "g").attr("class", "link")
        .attr('d', d => { const o = { x: source.x0 || 0, y: source.y0 || 0 }; return diagonal(o, o); });

    linkEnter.merge(link).transition().duration(500).attr('d', d => diagonal(d, d.parent));
    link.exit().transition().duration(500).attr('d', d => diagonal(source, source)).remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

function diagonal(s, d) {
    return `M ${s.x} ${s.y} C ${s.x} ${(s.y + d.y) / 2}, ${d.x} ${(s.y + d.y) / 2}, ${d.x} ${d.y}`;
}

function showDetails(d) {
    const infoContent = document.getElementById('info-content');
    let html = `<h4>${d.data.name}</h4><p>Type: <strong>${d.data.type.toUpperCase()}</strong></p>`;

    if (d.data.type === 'application' && d.data.flowIds) {
        d.data.flowIds.forEach(fid => {
            const seq = d.data.sequences[fid];
            html += `<div class="sequence-box">
                <strong>Flow ID: ${fid}</strong>`;
            html += seq.map((name, idx) => `
                <div class="flow-step ${name === d.data.name ? 'highlight-step' : ''}">
                    <span class="step-num">${idx + 1}</span> ${name}
                </div>`).join('');
            html += `</div>`;
        });
    } else {
        html += `<p class="placeholder">Explore the hierarchy to see data flows.</p>`;
    }
    infoContent.innerHTML = html;
}

function centerOnNode(d) {
    const scale = d3.zoomTransform(svg.node()).k;
    const x = width / 2 - d.x * scale;
    const y = 200 - d.y * scale;
    svg.transition().duration(750).call(d3.zoom().transform, d3.zoomIdentity.translate(x, y).scale(scale));
}

function resetView() {
    d3.select("#mindmap").call(d3.zoom().transform, d3.zoomIdentity.translate(width / 2, 100).scale(0.8));
}


document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');

    // Reset button logic
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Reset search input
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
            // Reset filters
            const orgSelect = document.getElementById('org-filter');
            const teamSelect = document.getElementById('team-filter');
            if (orgSelect) orgSelect.value = 'all';
            if (teamSelect) teamSelect.value = 'all';
            // Hide match count
            const matchBadge = document.getElementById('match-count');
            if (matchBadge) matchBadge.style.display = 'none';
            // Reset mindmap view
            if (typeof resetView === 'function') resetView();
            // Collapse all nodes
            if (typeof root !== 'undefined' && root.children) root.children.forEach(collapseAll);
            if (typeof update === 'function') update(root);
            // Reset info panel
            const infoContent = document.getElementById('info-content');
            if (infoContent) infoContent.innerHTML = '<p class="placeholder">Click a node to explore the specific data flow sequence.</p>';
        });
    }

    // Set initial arrow icon based on sidebar state
    if (toggleBtn) {
        toggleBtn.innerText = sidebar.classList.contains('collapsed') ? '➡️' : '⬅️';
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            this.innerText = isCollapsed ? '➡️' : '⬅️';
        });
    }
});