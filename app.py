from flask import Flask, render_template, jsonify
import json

app = Flask(__name__)

def build_tree():
    with open('flows.json') as f:
        flows = json.load(f)
    with open('organizations.json') as f:
        orgs = json.load(f)

    # 1. Group Flows by Team and FlowId
    grouped = {}
    for f in flows:
        key = (f['Team'], f['FlowId'])
        if key not in grouped: grouped[key] = []
        grouped[key].append(f)

    # 2. Build Sequential Chains (Removing the "Flow X" node)
    team_flows = {}
    for (team, fid), app_list in grouped.items():
        sorted_apps = sorted(app_list, key=lambda x: x['SequenceNo'])
        
        # Pre-capture the full sequence for the sidebar display
        full_seq = [a['Application'] for a in sorted_apps]
        
        def chain_apps(apps):
            if not apps: return None
            # Every app node now carries its full flow context
            node = {
                "name": apps[0]['Application'], 
                "type": "application",
                "flowId": fid,
                "sequence": full_seq
            }
            nxt = chain_apps(apps[1:])
            if nxt: node["children"] = [nxt]
            return node
        
        flow_chain = chain_apps(sorted_apps)
        
        if team not in team_flows: team_flows[team] = []
        if flow_chain: team_flows[team].append(flow_chain)

    # 3. Map Organizations
    org_map = {o['OrganizationName']: o['Teams'] for o in orgs}

    def get_node(name):
        node = {"name": name}
        if name in org_map: node["type"] = "org"
        elif name in team_flows: node["type"] = "team"
        else: node["type"] = "sub-org"

        children = []
        if name in team_flows: children.extend(team_flows[name])
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