"""Builds the two n8n workflows as importable JSON from the code in nodes/.

    python3 build.py                 -> out/job-watch.json (with seed.json state if present) and out/cover-letter.json
    python3 build.py --no-state      -> out/job-watch-no-state.json and out/cover-letter.json
    python3 build.py --seed PATH     -> use another seed file (seen ads and earlier thoughts)
"""
import json, uuid, sys, pathlib

BASE = pathlib.Path(__file__).parent
FOLDER = 'job-watch'
code_of = lambda f: (BASE / 'nodes' / FOLDER / f).read_text()

seed_path = BASE / 'seed.json'
if '--seed' in sys.argv:
    seed_path = pathlib.Path(sys.argv[sys.argv.index('--seed') + 1])
seed = json.loads(seed_path.read_text()) if seed_path.exists() and '--no-state' not in sys.argv else None

# Credential references by id and name. n8n links them to the credentials on your instance;
# if the ids differ, pick the right credential in each node after import.
CRED = {
    'resrobot': {'httpQueryAuth': {'id': 'ikzn1YM5XySHeUuQ', 'name': 'ResRobot'}},
    'ors': {'httpHeaderAuth': {'id': 'dIJl4J8MDwV7z2jT', 'name': 'OpenRouterService'}},
    'ollama': {'ollamaApi': {'id': 'A1v1T6g67or7bDQA', 'name': 'Ollama GPU0'}},
    'smtp': {'smtp': {'id': 'jHBafLz2xDHvSkch', 'name': 'Gmail SMTP'}},
}

nodes, conns = [], {}

def node(name, type_, version, params, **extra):
    n = {'parameters': params, 'type': type_, 'typeVersion': version, 'position': [0, 0],
         'id': str(uuid.uuid4()), 'name': name}
    n.update(extra)
    nodes.append(n)
    return name

def code(name, file, per_item=False, **extra):
    p = {'jsCode': code_of(file)}
    if per_item:
        p['mode'] = 'runOnceForEachItem'
    return node(name, 'n8n-nodes-base.code', 2, p, **extra)

def connect(src, dst, kind='main'):
    conns.setdefault(src, {}).setdefault(kind, [[]])[0].append({'node': dst, 'type': kind, 'index': 0})

q = lambda n, v: {'name': n, 'value': v}

# ---------- Triggers and profiles ----------
node('Schedule Trigger', 'n8n-nodes-base.scheduleTrigger', 1.2,
     {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 7-11 * * *'}]}})
node('Run manually', 'n8n-nodes-base.manualTrigger', 1, {})
node('Read profiles', 'n8n-nodes-base.readWriteFile', 1,
     {'operation': 'read', 'fileSelector': '/private/people/*.json', 'options': {}})
node('Parse profiles', 'n8n-nodes-base.extractFromFile', 1,
     {'operation': 'fromJson', 'binaryPropertyName': 'data', 'options': {}})
code('Select people', '01_select_people.js')

# ---------- Search, filter, rank ----------
code('Build searches', '02_build_searches.js')
node('Search jobs', 'n8n-nodes-base.httpRequest', 4.2, {
    'url': '={{ $json.url }}',
    'sendHeaders': True,
    'headerParameters': {'parameters': [{'name': 'accept', 'value': 'application/json'}]},
    'options': {'pagination': {'pagination': {
        'parameters': {'parameters': [{'name': 'offset', 'value': '={{ $pageCount * 100 }}'}]},
        'paginationCompleteWhen': 'other',
        'completeExpression': '={{ $response.body.hits.length < 100 }}',
        'limitPagesFetched': True, 'maxRequests': 10, 'requestInterval': 500}}}
}, retryOnFail=True, onError='continueRegularOutput')
code('Filter ads', '03_filter_ads.js')
code('Prepare matching', '04_prepare_matching.js')
node('Match profile', 'n8n-nodes-base.httpRequest', 4.2, {
    'method': 'POST', 'url': '={{ $json.embedUrl }}',
    'sendBody': True, 'specifyBody': 'json',
    'jsonBody': '={{ JSON.stringify({ model: $json.embedModel, input: $json.texts }) }}',
    'options': {'timeout': 300000}
})
code('Rank', '05_rank.js')

# ---------- Travel times: three lanes, one after the other ----------
code('Plan trips', '06_plan_trips.js')
code('Car trips', '07_car_trips.js', alwaysOutputData=True)
node('Car', 'n8n-nodes-base.httpRequest', 4.2, {
    'method': 'POST', 'url': 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/json',
    'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
    'sendBody': True, 'specifyBody': 'json',
    'jsonBody': '={{ JSON.stringify({ coordinates: [[$json.homeLon, $json.homeLat], [$json.lon, $json.lat]], instructions: false, geometry: false }) }}',
    'options': {'batching': {'batch': {'batchSize': 1, 'batchInterval': 1600}}}
}, credentials=CRED['ors'], onError='continueRegularOutput')
code('Save car', '08_save_car.js', per_item=True, alwaysOutputData=True)

code('Transit trips', '09_transit_trips.js', alwaysOutputData=True)
node('Transit', 'n8n-nodes-base.httpRequest', 4.2, {
    'url': 'https://api.resrobot.se/v2.1/trip',
    'authentication': 'genericCredentialType', 'genericAuthType': 'httpQueryAuth',
    'sendQuery': True,
    'queryParameters': {'parameters': [
        q('format', 'json'),
        q('originCoordLat', '={{ $json.homeLat }}'), q('originCoordLong', '={{ $json.homeLon }}'),
        q('destCoordLat', '={{ $json.lat }}'), q('destCoordLong', '={{ $json.lon }}'),
        q('date', '={{ $json.date }}'), q('time', '={{ $json.time }}'),
        q('searchForArrival', '={{ $json.arrive }}'), q('numF', '6'),
    ]},
    'options': {'batching': {'batch': {'batchSize': 1, 'batchInterval': 1500}}}
}, credentials=CRED['resrobot'], onError='continueRegularOutput')
code('Save transit', '10_save_transit.js', per_item=True, alwaysOutputData=True)

code('Flight trips', '11_flight_trips.js', alwaysOutputData=True)
node('Transit from airport', 'n8n-nodes-base.httpRequest', 4.2, {
    'url': 'https://api.resrobot.se/v2.1/trip',
    'authentication': 'genericCredentialType', 'genericAuthType': 'httpQueryAuth',
    'sendQuery': True,
    'queryParameters': {'parameters': [
        q('format', 'json'),
        q('originCoordLat', '={{ $json.fromLat }}'), q('originCoordLong', '={{ $json.fromLon }}'),
        q('destCoordLat', '={{ $json.lat }}'), q('destCoordLong', '={{ $json.lon }}'),
        q('date', '={{ $json.date }}'), q('time', '={{ $json.time }}'), q('searchForArrival', '0'), q('numF', '6'),
    ]},
    'options': {'batching': {'batch': {'batchSize': 1, 'batchInterval': 1500}}}
}, credentials=CRED['resrobot'], onError='continueRegularOutput')
code('Save flight', '12_save_flight.js', per_item=True, alwaysOutputData=True)
code('Attach travel times', '13_attach_travel_times.js')

# ---------- Email ----------
code('Compose email', '14_compose_email.js')
node('Daily thought', '@n8n/n8n-nodes-langchain.chainLlm', 1.9,
     {'promptType': 'define', 'text': '={{ $json.thoughtPrompt }}', 'batching': {}}, onError='continueRegularOutput')
node('Thought model', '@n8n/n8n-nodes-langchain.lmChatOllama', 1,
     # Same model and context length as the letters, so Ollama keeps one model loaded instead of swapping
     {'model': 'gemma3:12b', 'options': {'temperature': 0.9, 'numCtx': 12288}}, credentials=CRED['ollama'])
code('Add thought', '15_add_thought.js')
node('Send email', 'n8n-nodes-base.emailSend', 2.1, {
    'fromEmail': '={{ $json.from }}', 'toEmail': '={{ $json.to }}',
    'subject': '={{ $json.subject }}', 'html': '={{ $json.html }}',
    'options': {'appendAttribution': False, 'bccEmail': '={{ $json.bcc }}'}
}, credentials=CRED['smtp'])

CHAIN = ['Read profiles', 'Parse profiles', 'Select people', 'Build searches', 'Search jobs', 'Filter ads',
         'Prepare matching', 'Match profile', 'Rank', 'Plan trips', 'Car trips', 'Car', 'Save car', 'Transit trips',
         'Transit', 'Save transit', 'Flight trips', 'Transit from airport', 'Save flight', 'Attach travel times',
         'Compose email', 'Daily thought', 'Add thought', 'Send email']
connect('Schedule Trigger', 'Read profiles')
connect('Run manually', 'Read profiles')
for a, b in zip(CHAIN, CHAIN[1:]):
    connect(a, b)
connect('Thought model', 'Daily thought', 'ai_languageModel')

# Layout: two rows so the whole chain is visible
for n in nodes:
    if n['name'] in CHAIN:
        k = CHAIN.index(n['name'])
        n['position'] = [(k % 12) * 240, 0 if k < 12 else 360]
pos = {n['name']: n['position'] for n in nodes}
for n in nodes:
    if n['name'] == 'Schedule Trigger': n['position'] = [-260, -100]
    if n['name'] == 'Run manually': n['position'] = [-260, 100]
    if n['name'] == 'Thought model': n['position'] = [pos['Daily thought'][0], 580]

workflow = {
    'name': 'Job watch',
    'nodes': nodes,
    'connections': conns,
    'active': False,
    'settings': {'executionOrder': 'v1', 'timezone': 'Europe/Stockholm', 'callerPolicy': 'workflowsFromSameOwner'},
    'staticData': {'global': {'seen': seed['seen'], 'thoughts': seed['thoughts'], 'travelCache': {}}} if seed else None,
    'pinData': {},
    'tags': [],
}
out = BASE / 'out' / ('job-watch.json' if seed else 'job-watch-no-state.json')
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(workflow, ensure_ascii=False, indent=2))
print('wrote', out, len(nodes), 'nodes')


# =====================================================================
# Cover letter: form -> profile -> ad -> model -> email with Word file
# =====================================================================
FOLDER = 'cover-letter'
nodes, conns = [], {}
node('Cover letter form', 'n8n-nodes-base.formTrigger', 2.6, {
    'formTitle': 'Personligt brev',
    'formDescription': 'Skriv gärna några ord om vad som lockar dig med tjänsten ovan, så blir brevet mer personligt. Utkastet kommer till din mejl inom några minuter.',
    'formFields': {'values': [
        {'fieldLabel': 'Tjänst', 'fieldName': 'tjanst'},
        {'fieldLabel': 'Annons-ID', 'fieldName': 'annons_id', 'requiredField': True},
        {'fieldLabel': 'Vad lockar dig med just det här jobbet?', 'fieldType': 'textarea', 'fieldName': 'motivering'},
        {'fieldType': 'hiddenField', 'fieldName': 'person'},
    ]},
    'options': {'path': 'cover-letter'}
}, webhookId=str(uuid.uuid4()))
node('Read profiles', 'n8n-nodes-base.readWriteFile', 1,
     {'operation': 'read', 'fileSelector': '/private/people/*.json', 'options': {}})
node('Parse profiles', 'n8n-nodes-base.extractFromFile', 1,
     {'operation': 'fromJson', 'binaryPropertyName': 'data', 'options': {}})
code('Select person', '01_select_person.js')
node('Fetch ad', 'n8n-nodes-base.httpRequest', 4.2, {
    'url': '=https://jobsearch.api.jobtechdev.se/ad/{{ $json.adId }}',
    'sendHeaders': True,
    'headerParameters': {'parameters': [{'name': 'accept', 'value': 'application/json'}]},
    'options': {}
}, retryOnFail=True)
code('Prepare ad', '02_prepare_ad.js')
code('Build profile', '03_build_profile.js')
node('Write letter', '@n8n/n8n-nodes-langchain.chainLlm', 1.9,
     {'promptType': 'define', 'text': '={{ $json.prompt }}', 'batching': {}})
node('Letter model', '@n8n/n8n-nodes-langchain.lmChatOllama', 1,
     {'model': 'gemma3:12b', 'options': {'temperature': 0.6, 'numCtx': 12288}}, credentials=CRED['ollama'])
code('Build email', '04_build_email.js')
code('Create Word file', '05_create_word_file.js')
node('Send email', 'n8n-nodes-base.emailSend', 2.1, {
    'fromEmail': '={{ $json.from }}', 'toEmail': '={{ $json.to }}',
    'subject': '={{ $json.subject }}', 'html': '={{ $json.html }}',
    'options': {'appendAttribution': False, 'fileAttachments': 'data', 'bccEmail': '={{ $json.bcc }}'}
}, credentials=CRED['smtp'])

CHAIN = ['Cover letter form', 'Read profiles', 'Parse profiles', 'Select person', 'Fetch ad', 'Prepare ad',
         'Build profile', 'Write letter', 'Build email', 'Create Word file', 'Send email']
for a, b in zip(CHAIN, CHAIN[1:]):
    connect(a, b)
connect('Letter model', 'Write letter', 'ai_languageModel')
for n in nodes:
    if n['name'] in CHAIN:
        n['position'] = [CHAIN.index(n['name']) * 240, 0]
    if n['name'] == 'Letter model':
        n['position'] = [CHAIN.index('Write letter') * 240, 220]

workflow = {
    'name': 'Cover letter',
    'nodes': nodes,
    'connections': conns,
    'active': False,
    'settings': {'executionOrder': 'v1', 'timezone': 'Europe/Stockholm', 'callerPolicy': 'workflowsFromSameOwner', 'binaryMode': 'separate'},
    'staticData': None,
    'pinData': {},
    'tags': [],
}
out = BASE / 'out' / 'cover-letter.json'
out.write_text(json.dumps(workflow, ensure_ascii=False, indent=2))
print('wrote', out, len(nodes), 'nodes')
