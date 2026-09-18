import sys,json,unittest
sys.path.insert(0,'scripts')
from collect import parse_listing,floor_value,publication_date,Page
class ParserTest(unittest.TestCase):
 def fixture(self,city='Granville',desc='Appartement situé en hypercentre au premier étage à rénover.'):
  item={'@type':'Apartment','name':'T2','description':desc,'numberOfRooms':2,'floorSize':{'value':30},'address':{'addressLocality':city,'postalCode':'50400'},'offers':{'@type':'Offer','price':90000}}
  return '<script type="application/ld+json">'+json.dumps(item)+'</script>'
 def test_granville_only(self):self.assertIsNone(parse_listing(self.fixture('Donville-les-Bains'),'https://example.com/1','pozzo','Pozzo'))
 def test_facts(self):
  p=parse_listing(self.fixture(),'https://example.com/1','pozzo','Pozzo');self.assertEqual(p['floor'],1);self.assertTrue(p['center']);self.assertEqual(p['condition'],'renovate');self.assertEqual(p['price'],90000)
 def test_unknown_floor_is_not_invented(self):self.assertIsNone(floor_value('Au dernier étage avec ascenseur'))
 def test_no_false_renovation(self):
  p=parse_listing(self.fixture(desc='En bon état sans travaux'),'https://example.com/1','pozzo','Pozzo');self.assertEqual(p['condition'],'good')
 def test_uppercase_label_and_unicode(self):self.assertEqual(floor_value('Étage : 3'),3);self.assertEqual(floor_value('Au 3ᵉ étage'),3)
 def test_only_explicit_publication_date(self):
  p=Page('<script type="application/ld+json">{"@type":"WebPage","dateModified":"2026-09-01"}</script>')
  self.assertEqual(publication_date(p,{}),(None,None))
  self.assertEqual(publication_date(p,{'datePublished':'2026-08-01T10:00:00Z'})[0],'2026-08-01')
  self.assertEqual(publication_date(p,{'datePublished':'2099-01-01'})[0],None)
 def test_french_publication_label(self):
  self.assertEqual(publication_date(Page('<p>Annonce publiée le 02/08/2026</p>'),{})[0],'2026-08-02')
if __name__=='__main__':unittest.main()
