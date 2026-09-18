"""Bounded, public-page collector. Never turn an inaccessible page into a deletion."""
import concurrent.futures, datetime, hashlib, html, json, re, sys, time, unicodedata
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

UA = 'RivageMonitor/1.0 (daily public property catalogue)'
SOURCES = [
 ('pozzo', 'Pozzo Immobilier', 'https://www.pozzo-immobilier.fr/fr/immobilier/vente/appartement/granville', r'/fr/immobilier/vente/appartement/granville/[^/?]+/\d+$'),
 ('century', 'Century 21 Royer Immo', 'https://www.century21-royer-granville.com/annonces/achat-appartement/v-granville/', r'/trouver_logement/detail/\d+/$'),
 ('iad', 'iad France', 'https://www.iadfrance.fr/annonces/granville-50400/vente/appartement', r'/annonce/appartement-vente-[^/]*granville[^/]*/r\d+$'),
 ('folliot', 'Cabinet Folliot', 'https://www.cabinetfolliot.com/vente/appartement/granville/', r'/fiches/[^?]*appartement[^?]*granville[^?]*\.html$')
]

def normal(s):
 return ''.join(c for c in unicodedata.normalize('NFKD', str(s).lower()) if not unicodedata.combining(c)).replace('’', "'")
def number(v):
 if isinstance(v,(float,int)):return float(v)
 try:return float(re.sub(r'[^\d.,-]', '', str(v)).replace(',', '.'))
 except ValueError:return None

def fetch(url):
 with urlopen(Request(url,headers={'User-Agent':UA,'Accept':'text/html'}),timeout=25) as r:
  if r.status != 200:raise ValueError('HTTP '+str(r.status))
  raw=r.read(4_000_001)
  if len(raw)>4_000_000:raise ValueError('page too large')
  s=raw.decode('utf-8','replace')
  if len(s)<800:raise ValueError('empty or blocked page')
  return s

class Page(HTMLParser):
 def __init__(self,s):
  super().__init__(convert_charrefs=True);self.links=[];self.lines=[];self.docs=[];self.skip=0;self.ld=False;self.buf='';self.meta={};self.feed(s)
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='a' and a.get('href'):self.links.append(a['href'])
  if t=='meta':self.meta[a.get('property',a.get('name',''))]=a.get('content','')
  if t in ('script','style','svg'):
   self.skip+=1
   if t=='script' and a.get('type')=='application/ld+json':self.ld=True;self.buf=''
 def handle_endtag(self,t):
  if t=='script' and self.ld:
   try:self.docs.append(json.loads(self.buf))
   except (ValueError,TypeError):pass
   self.ld=False
  if t in ('script','style','svg'):self.skip=max(0,self.skip-1)
 def handle_data(self,s):
  if self.ld:self.buf+=s
  if not self.skip and s.strip():self.lines.append(s.strip())
 @property
 def text(self):return '\n'.join(self.lines)

def nodes(x):
 if isinstance(x,list):
  for v in x:yield from nodes(v)
 elif isinstance(x,dict):
  yield x
  for v in x.values():
   if isinstance(v,(dict,list)):yield from nodes(v)
def typed(n,t):return t in (n.get('@type',[]) if isinstance(n.get('@type'),list) else [n.get('@type')])
def floor_value(text):
 t=normal(text)
 m=re.search(r'(?:^|\n)etage\s*[:\s]+(\d{1,2})\b',t)
 if m:return int(m[1])
 if re.search(r'(?:situe|appartement|studio|en|au)\s+(?:au\s+)?rez.de.chaussee',t):return 0
 m=re.search(r'(?:au|situe au|situe en|en)\s+(\d{1,2})(?:er|e|eme|\s)*\s*etage',t)
 if m:return int(m[1])
 for n,w in enumerate(['premier','deuxieme','troisieme','quatrieme','cinquieme','sixieme'],1):
  if re.search(r'\b'+w+r'\s+etage',t):return n
 return None

def publication_date(page, apartment):
 # Only explicit publication fields; image paths, modified dates and crawl dates are not publication dates.
 candidates=[]
 for key in ('datePosted','datePublished'):
  if apartment.get(key):candidates.append((apartment[key], 'annonce.'+key))
 for doc in page.docs:
  roots=doc if isinstance(doc,list) else [doc]
  for node in roots:
   if not isinstance(node,dict):continue
   for item in [node]+(node.get('@graph',[]) if isinstance(node.get('@graph'),list) else []):
    if isinstance(item,dict) and any(typed(item,t) for t in ('RealEstateListing','WebPage')):
     for key in ('datePosted','datePublished'):
      if item.get(key):candidates.append((item[key],'page.'+key))
 for key in ('article:published_time','datePublished','dateposted'):
  if page.meta.get(key):candidates.append((page.meta[key],'meta.'+key))
 for match in re.finditer(r'(?:mise en ligne|publiee?|ajoutee?)\s+le\s+(\d{2})[/.](\d{2})[/.](\d{4})',normal(page.text)):
  candidates.append((match[3]+'-'+match[2]+'-'+match[1],'libelle de publication'))
 today=datetime.datetime.now(datetime.timezone.utc).date()
 for value,evidence in candidates:
  value=str(value).strip()
  if not re.match(r'^\d{4}-\d{2}-\d{2}(?:T|$)',value):continue
  try:day=datetime.date.fromisoformat(value[:10])
  except ValueError:continue
  if datetime.date(2000,1,1)<=day<=today:return day.isoformat(),evidence
 return None,None

def parse_listing(s,url,key,agency):
 p=Page(s);ns=list(nodes(p.docs));flat=p.text;norm=normal(flat)
 apartments=[n for n in ns if typed(n,'Apartment')]
 if not apartments:return None
 a=apartments[0];address=a.get('address',{})
 if normal(address.get('addressLocality','')).strip()!='granville' or str(address.get('postalCode','50400'))!='50400':return None
 offers=a.get('offers') or next((n for n in ns if typed(n,'Offer') and n.get('price')), {})
 if isinstance(offers,list):offers=offers[0] if offers else {}
 price=number(offers.get('price')); area=number(a.get('floorSize',{}).get('value'));rooms=number(a.get('numberOfRooms'))
 if not price or not area or not rooms or not (10000<price<10_000_000 and 9<area<1500):return None
 # Prefer the precise surface in a Century21 title over its rounded JSON-LD field.
 if key=='century':
  m=re.search(r'([\d.,]+)\s*m2',a.get('name',''))
  if m:area=number(m[1]) or area
 full=flat.split('\nDescription\n',1)[-1] if '\nDescription\n' in flat else a.get('description','')
 for end in ['\nLocalisation\n','\nCaractéristiques\n','\nLes caractéristiques\n','La presente annonce immobiliere','La présente annonce immobilière']:
  full=full.split(end)[0]
 if not full:full=a.get('description','')
 t=normal(full)
 publishedAt,publicationEvidence=publication_date(p,a)
 center=bool(re.search(r'\bhyper[- ]?centre\b|(?:en plein|en|du|le|au)\s+(?:coeur|cœur)\s+(?:de|du)\s+(?:centre|granville)|(?:situe|situee|situes|situees|en|plein)\s+(?:en\s+)?centre[- ]ville|cours jonville|rue couraye|au coeur du quartier historique',t))
 renovate=bool(re.search(r'a renover|renovation (?:complete|totale|a prevoir)|travaux (?:a prevoir|de renovation)|a rafraichir|rafraichissement (?:a prevoir|necessaire)',t))
 good=bool(re.search(r'sans travaux|aucun travaux|entierement renove|entierement refait|en bon etat',t))
 condition='renovate' if renovate else 'good' if good else 'unknown'
 floor=floor_value(flat if key in ('century','iad') else full)
 # Only parse a literal rating; do not infer current DPE rules from the SVG or consumption.
 dpe='?';m=re.search(r'(?:diagnostic de performance energetique \(dpe\)|classe energie|classe energetique|dpe)\s*[:\s]+([a-g])\b',norm)
 if m:dpe=m[1].upper()
 ref=next((str(x.get('value')) for x in a.get('identifier',[]) if isinstance(x,dict) and x.get('name')=='ref'),None)
 if not ref:
  m=re.search(r'\bref(?:erence)?\s*[:.]?\s*([A-Za-z0-9-]+)',normal(flat));ref=m[1].upper() if m else url.rstrip('/').split('/')[-1].lstrip('r')
 occupied=bool(re.search(r'vendu loue|actuellement loue|locataire en place|bail en cours',t))
 photo=a.get('image')
 if isinstance(photo,list):photo=photo[0] if photo else None
 if isinstance(photo,dict):photo=photo.get('url') or next((n.get('url',n.get('contentUrl')) for n in ns if n.get('@id')==photo.get('@id') and typed(n,'ImageObject')),None)
 if not photo:photo=p.meta.get('og:image')
 if photo and not str(photo).startswith('https://'):photo=None
 charges=None;tax=None
 for pattern,field in [(r'charges (?:courantes par an|de copropriete|previsionnelles)\s*[:\s]+([\d\s.,\u202f\xa0]+)\s*€','charges'),(r'taxe fonciere\s*[:\s]+([\d\s.,\u202f\xa0]+)\s*€','tax')]:
  m=re.search(pattern,norm)
  if m:
   if field=='charges':charges=number(m[1])
   else:tax=number(m[1])
 # Published asking-rent and renovation figures remain explicit screening assumptions, not quotations.
 works=round(area*(1100 if renovate or dpe in 'FG?' else 250)/500)*500
 rent=round(min(950,area*(17 if area<25 else 15 if area<40 else 13))/5)*5
 assets=[]
 for term,label in [('balcon','Balcon annoncé'),('cave','Cave annoncée'),('ascenseur','Ascenseur annoncé'),('parking','Parking annoncé')]:
  if term in t:assets.append(label)
 risks=['Loyer et travaux : hypothèses automatiques de présélection, à confirmer par avis locatifs et devis.','Adresse exacte, copropriété et disponibilité à confirmer auprès de l’agence.']
 if floor is None:risks.append('Étage non établi par les données lisibles.')
 if not center:risks.append('Hypercentre non confirmé par le descriptif.')
 if dpe in 'FG?':risks.append('DPE et faisabilité de la rénovation énergétique à vérifier avant toute décision.')
 if occupied:risks.append('Occupation annoncée : vérifier le bail et la disponibilité pour travaux.')
 areaWarning=None
 if key=='century' and abs(area-(number(a.get('floorSize',{}).get('value')) or area))>.1:risks.append('Surface précise du titre différente de la surface arrondie des données structurées : mesurage à vérifier.')
 return dict(publishedAt=publishedAt,publicationEvidence={'source':url,'field':publicationEvidence} if publicationEvidence else None,id=key+'-'+hashlib.sha256(url.encode()).hexdigest()[:12],title=f'{int(rooms)} pièces · {area:g} m² à Granville',area=area,rooms=int(rooms),bedrooms=a.get('numberOfBedrooms'),floor=floor,price=price,zone='Centre annoncé' if center else 'Granville · secteur à confirmer',center=center,condition=condition,dpe=dpe,agency=agency,ref=ref,charges=charges,tax=tax,ownerCharges=max(350,(charges or 0)*.4),works=works,rent=rent,occupied=occupied,source=url,photo=photo,description=f'Appartement de {area:g} m² et {int(rooms)} pièces à Granville. '+('Rénovation annoncée. ' if renovate else '')+('Bien annoncé vendu loué. ' if occupied else '')+'Caractéristiques extraites de la fiche de l’agence ; les montants de travaux et de loyer sont des hypothèses de simulation.',assets=assets,risks=risks,priority=5 if center and floor and renovate else 20,archived=False,checked=datetime.datetime.now(datetime.timezone.utc).date().isoformat(),automated=True,estimateBasis='Barème indicatif, non devisé : loyer 13–17 €/m²/mois plafonné à 950 € ; travaux 250 ou 1 100 €/m² selon état/DPE, plus 15 % d’imprévus.')

def collect_source(spec):
 key,agency,root,detailpattern=spec;report={'id':key,'name':agency,'url':root,'status':'error','checked':0,'discovered':0,'errors':0};listings=[]
 try:
  robots=RobotFileParser();origin=urlparse(root);robots.set_url(origin.scheme+'://'+origin.netloc+'/robots.txt')
  try:
   with urlopen(Request(robots.url,headers={'User-Agent':UA}),timeout=15) as r:robots.parse(r.read(500000).decode('utf8','replace').splitlines())
  except Exception as e:raise ValueError('robots.txt inaccessible; collecte reportée') from e
  if not robots.can_fetch(UA,root):raise ValueError('robots.txt ne permet pas cette page')
  pages=[root];visited=set();links=set()
  while pages and len(visited)<5:
   u=pages.pop(0)
   if u in visited:continue
   if not robots.can_fetch(UA,u):continue
   page=Page(fetch(u));visited.add(u)
   for href in page.links:
    link=urldefrag(urljoin(u,html.unescape(href)))[0]
    if urlparse(link).netloc!=origin.netloc:continue
    if re.search(detailpattern,urlparse(link).path):links.add(link.split('?')[0])
    elif (link.startswith(root.rstrip('/')) and (re.search(r'[?&]page=\d+',link) or re.search(r'/page-\d+/',link))) and link not in visited:pages.append(link)
   time.sleep(.5)
  report['discovered']=len(links)
  if not links:raise ValueError('aucune annonce lisible dans les pages consultées')
  for u in sorted(links)[:120]:
   if not robots.can_fetch(UA,u):report['errors']+=1;continue
   try:
    item=parse_listing(fetch(u),u,key,agency)
    if item:listings.append(item);report['checked']+=1
    else:report['errors']+=1
   except Exception:report['errors']+=1
   time.sleep(.25)
  report['status']='ok' if report['checked'] and not report['errors'] else 'partial' if report['checked'] else 'error'
  if report['status']=='error':report['message']='aucune fiche exploitable ; données précédentes conservées'
 except Exception as e:report['message']=str(e)[:180]
 return listings,report

if __name__=='__main__':
 items=[];reports=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for found,report in pool.map(collect_source,SOURCES):items.extend(found);reports.append(report)
 print(json.dumps({'properties':items,'sources':reports},ensure_ascii=False))
