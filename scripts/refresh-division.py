"""Recheck the curated building selection; blocked pages never imply a sale."""
import concurrent.futures, datetime, json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request,urlopen
from urllib.robotparser import RobotFileParser
from collect import Page,nodes,typed,normal,number,fetch,UA

def refresh(original):
 p=dict(original);now=datetime.datetime.now(datetime.timezone.utc).isoformat();p['lastAttemptAt']=now
 try:
  origin=urlparse(p['source']);robots=RobotFileParser();robots.set_url(origin.scheme+'://'+origin.netloc+'/robots.txt')
  with urlopen(Request(robots.url,headers={'User-Agent':UA}),timeout=15) as r:robots.parse(r.read(500000).decode('utf8','replace').splitlines())
  if not robots.can_fetch(UA,p['source']):raise ValueError('robots.txt ne permet pas cette page')
  page=Page(fetch(p['source']));ns=list(nodes(page.docs))
  candidate=next((n for n in ns if any(typed(n,t) for t in ('House','SingleFamilyResidence','Residence','ApartmentComplex')) and normal(n.get('address',{}).get('addressLocality','')).strip()=='granville'),None)
  if not candidate:raise ValueError('Données structurées non exploitables ; observation précédente conservée')
  a=candidate
  if str(a.get('address',{}).get('postalCode','50400'))!='50400':raise ValueError('Localisation différente')
  offers=a.get('offers') or next((n for n in ns if typed(n,'Offer') and n.get('price')), {})
  if isinstance(offers,list):offers=offers[0] if offers else {}
  price=number(offers.get('price'));area=number(a.get('floorSize',{}).get('value'))
  if not price or not area or not 10000<price<10000000 or abs(area-p['area'])/p['area']>.1:raise ValueError('Prix ou surface à contrôler manuellement')
  # Preserve researched layout, risks and assumed rents; only refresh supported facts.
  p.update(price=price,checked=now[:10],verification='direct',refreshStatus='ok')
  image=page.meta.get('og:image','')
  if image.startswith('https://') and not any(x in image.lower() for x in ('logo','default','placeholder')):p['photo']=image
  p.pop('refreshMessage',None)
 except Exception as e:p.update(refreshStatus='unavailable',refreshMessage=str(e)[:180])
 return p

if __name__=='__main__':
 path=Path('data/division.json');catalog=json.loads(path.read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:catalog['properties']=list(pool.map(refresh,catalog['properties']))
 catalog['lastAttemptAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 if any(p.get('refreshStatus')=='ok' for p in catalog['properties']):catalog['updatedAt']=catalog['lastAttemptAt']
 path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'projects':len(catalog['properties']),'checked':sum(p.get('refreshStatus')=='ok' for p in catalog['properties']),'sources':[{'id':p['id'],'status':p['refreshStatus']} for p in catalog['properties']]}))
