from flask import Flask, render_template, jsonify
import json

app = Flask(__name__)

def build_tree():
    try:
        with open('flows.json') as f:
            flows = json.load(f)
        with open('organizations.json') as f:
            orgs = json.load(f)
    except FileNotFoundError:
        return {"name": "Data Not Found", "children": []}

    # 1. Group Flows by Team
    team_data = {}
    for f in flows:
        team = f['Team']
        if team not in team_data:
            team_data[team] = []
        team_data[team].append(f)

    # 2. Build Merged Sequential Trees per Team
    team_flows = {}
    for team, app_list in team_data.items():
        team_root_nodes = []
        
        # Get unique FlowIds for this team
        flow_ids = sorted(list(set(a['FlowId'] for a in app_list)))
        
        for fid in flow_ids:
            # Get steps for this specific flow sorted by sequence
            steps = sorted([a for a in app_list if a['FlowId'] == fid], key=lambda x: x['SequenceNo'])
            full_seq = [s['Application'] for s in steps]
            
            # Pointer to the current level we are merging into
            current_level = team_root_nodes
            
            for step in steps:
                app_name = step['Application']
                
                # Check if this app exists at this specific level
                target_node = next((n for n in current_level if n['name'] == app_name), None)
                
                if not target_node:
                    target_node = {
                        "name": app_name,
                        "type": "application",
                        "flowIds": [fid],
                        "sequences": {str(fid): full_seq},
                        "children": []
                    }
                    current_level.append(target_node)
                else:
                    # Merge metadata if node exists
                    if fid not in target_node['flowIds']:
                        target_node['flowIds'].append(fid)
                    target_node['sequences'][str(fid)] = full_seq
                
                # Move deeper into the tree
                current_level = target_node['children']
        
        team_flows[team] = team_root_nodes

    # 3. Map Organizations
    org_map = {o['OrganizationName']: o['Teams'] for o in orgs}

    def get_node(name):
        node = {"name": name}
        # Determine Type
        if name in org_map: node["type"] = "org"
        elif name in team_flows: node["type"] = "team"
        else: node["type"] = "sub-org"

        children = []
        # Add Team Flow Nodes
        if name in team_flows:
            children.extend(team_flows[name])
        
        # Add Sub-Org/Team Nodes from Organization Map
        if name in org_map:
            for sub in org_map[name]:
                children.append(get_node(sub))
        
        if children: node["children"] = children
        return node

    return get_node("IFS")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def data():
    return jsonify(build_tree())

if __name__ == '__main__':
    app.run(debug=True)