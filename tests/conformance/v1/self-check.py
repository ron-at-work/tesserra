#!/usr/bin/env python3
"""Dependency-light integrity and structural checker for Agent Proof v1 fixtures."""
import base64, hashlib, json, shutil, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent
CASES, MALFORMED = ROOT / 'cases', ROOT / 'malformed'
def b64(x): return base64.urlsafe_b64encode(x).decode().rstrip('=')
def dec(x): return base64.urlsafe_b64decode(x + '=' * (-len(x) % 4))
def jcs(x): return json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
def sem(x): return {k:v for k,v in x.items() if k != 'proof'}
def cont(x): return {k:v for k,v in x.items() if k not in ('proof','id')}
def hid(p, x): return b64(hashlib.sha256(p+b'\0'+jcs(x)).digest())
def aid(x): return 'urn:agent-proof:v1:sha256:'+hid(b'AGENT-PROOF-ARTIFACT-ID-V1',cont(x))
def kid(x): return 'urn:agent-proof:kid:v1:sha256:'+hid(b'AGENT-PROOF-KEY-ID-V1',x)
def policy(s): return 'urn:agent-proof:policy:v1:sha256:'+hid(b'AGENT-PROOF-POLICY-HASH-V1',{k:v for k,v in s.items() if k!='policy_hash'})
def target(x): return x.get('target_key_id', x.get('target_id',''))
def status(d):
 first=sorted((sem(x) for x in d['artifacts'] if x['kind'] in ('key_status','revocation')),key=lambda x:(x.get('publisher',{}).get('id',''),target(x),x['sequence'],x['kind']))
 second=sorted((sem(x) for x in d['artifacts'] if x['kind']=='key_rotation'),key=lambda x:(x['publisher']['id'],x['old_key_id'],x['sequence'],x['kind']))
 return 'urn:agent-proof:status:v1:sha256:'+hid(b'AGENT-PROOF-STATUS-SNAPSHOT-V1',first+second)
def pem(raw):
 der=bytes.fromhex('302a300506032b6570032100')+raw
 return '-----BEGIN PUBLIC KEY-----\n'+base64.encodebytes(der).decode()+'-----END PUBLIC KEY-----\n'
def verify(jwk,msg,sig):
 with tempfile.TemporaryDirectory() as td:
  p=Path(td);(p/'k').write_text(pem(dec(jwk['x'])));(p/'m').write_bytes(msg);(p/'s').write_bytes(dec(sig))
  return subprocess.run(['openssl','pkeyutl','-verify','-pubin','-inkey',str(p/'k'),'-rawin','-in',str(p/'m'),'-sigfile',str(p/'s')],capture_output=True).returncode==0
if not shutil.which('openssl'):sys.exit('openssl is required for Ed25519 fixture verification')
meta=json.loads((ROOT/'metadata/derivations.json').read_text()); manifest=json.loads((ROOT/'manifest.json').read_text()); schema=json.loads((ROOT.parent.parent.parent/'docs/protocol/schemas/verification.schema.json').read_text())
codes=set(schema['properties']['code']['enum']);keys={x['key_id']:x['public_jwk'] for x in meta['key_material'].values()};assert all(kid(v)==k for k,v in keys.items())
paths={x['path'] for x in manifest['cases']}; shipped={'cases/'+p.name for p in CASES.glob('*.json')}|{'malformed/'+p.name for p in MALFORMED.glob('*.json')};assert paths==shipped,(paths^shipped)
records={(x['fixture'],x['id'],x['kind']) for x in meta['records']}; artifact_records=set();total=verified=id_invalid=sig_invalid=hashes=links=0
for f in sorted(CASES.glob('*.json')):
 d=json.loads(f.read_text());r=d['expected_result'];assert r['code'] in codes;assert d['trust_snapshot']['policy_hash']==policy(d['trust_snapshot']);assert r['policy_hash']==policy(d['trust_snapshot']);assert r['status_snapshot_hash']==status(d);hashes+=2
 ids={x['id'] for x in d['artifacts']};assert set(r['evidence_ids'])<=ids
 # direct case-envelope structural checks (dependency-free schema subset)
 assert isinstance(d['artifacts'],list) and d['artifacts'] and d['replay_mode'] in ('online','offline')
 for needed in ('audience','action','resource','task','expected_signer','expected_payload_digest','expected_task_context_digest','replay_required'):assert needed in d['verification_context']
 # Dependency-free security-critical schema checks for root/key credential roles and history input.
 roots=d['trust_snapshot']['roots']; assert all(x['credential_purpose']=='agent-root-authority' for x in roots)
 for credential in (x for x in d['artifacts'] if x['kind']=='credential'):
  expected='agent-root-authority' if credential['subject']['id']['path'][-1]=='controller' else 'agent-key-binding'
  assert credential['credential_purpose']==expected, (f.name, credential['subject'])
 if f.name=='historical-snapshot.json':
  archived=d['archived_snapshot']; assert archived['verification_mode']=='historical' and archived['policy_hash'].startswith('urn:agent-proof:policy:') and archived['status_snapshot_hash'].startswith('urn:agent-proof:status:') and archived['policy_hash'] != r['policy_hash'] and archived['status_snapshot_hash'] != r['status_snapshot_hash'] and 'HISTORICAL_SNAPSHOT' in r['warnings']
 if r['valid']: assert 'NOT_ALL_STAGES_EXECUTED' not in r['warnings']
 elif r['code'] in ('REPLAY_DETECTED','OFFLINE_REPLAY_UNAVAILABLE'): assert 'NOT_ALL_STAGES_EXECUTED' not in r['warnings']
 else: assert r['warnings']==['NOT_ALL_STAGES_EXECUTED'], (f.name, r['warnings'])
 streams={}
 for x in d['artifacts']:
  total+=1;artifact_records.add((f.name,x['id'],x['kind']));assert x['version'].startswith('agent-proof/') and 'proof' in x
  intentionally_id_invalid=(r['code']=='ID_MISMATCH' and x['kind']=='request') 
  if intentionally_id_invalid:id_invalid+=1
  else:assert x['id']==aid(x),(f.name,x['kind'])
  intentionally_sig_invalid=(r['code'] in ('INVALID_SIGNATURE','UNSUPPORTED_KIND','ID_MISMATCH') and x.get('kind') in ('request','other')) 
  if intentionally_sig_invalid:sig_invalid+=1
  else:
   assert x['proof']['kid'] in keys,(f.name,x['kind']);assert verify(keys[x['proof']['kid']],b'AGENT-PROOF-SIGN-V1\0'+x['kind'].encode()+b'\0'+jcs(sem(x)),x['proof']['sig']),(f.name,x['kind']);verified+=1
  if x['kind']=='key_rotation': assert 'publisher' in x and x['publisher'] == d['trust_snapshot']['issuer_authorities'][0]['principal']
  if x['kind'] in ('key_status','revocation'):
   k=(x['publisher']['id'],target(x));streams.setdefault(k,[]).append(x)
 for stream in streams.values():
  stream.sort(key=lambda x:x['sequence'])
  for i,x in enumerate(stream):
   if i==0:assert x['previous_digest'] is None
   else:
    prev=stream[i-1];assert x['sequence']==prev['sequence']+1;assert x['previous_digest']=='sha256:'+b64(hashlib.sha256(jcs(sem(prev))).digest());links+=1
assert records==artifact_records,(len(records),len(artifact_records),records^artifact_records)
for x in manifest['cases']:
 assert x['primary_code'] in codes and all(c in codes for c in x.get('secondary_codes',[]))
 if x.get('deliberate_schema_invalid'): assert x['path']=='malformed/schema-invalid-complete-envelope.json' and x.get('deliberate_schema_invalid_reason')
print(f'ok: {len(keys)} key IDs; {total} shipped artifacts; {verified} verified signatures; {id_invalid} deliberate ID/key-ID failures; {sig_invalid} deliberate signature failures; {hashes} policy/status hashes; {links} checked status links; {len(paths)} manifested inputs')
