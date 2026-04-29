type BuildLeafletOptions = {
  showPulse?: boolean;
  enableRoute?: boolean;
  zoom?: number;
};

const severityColors: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#84CC16',
};

export function buildLeafletHTML(
  lat: number,
  lng: number,
  options: BuildLeafletOptions = {},
): string {
  const showPulse = options.showPulse ?? false;
  const enableRoute = options.enableRoute ?? false;
  const zoom = options.zoom ?? 15;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body,#map{width:100%;height:100%;background:#e8e0d8;}
.dot{width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,.6);}
.ring{width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,.2);animation:pulse 2s ease-out infinite;}
.dest{width:22px;height:22px;border-radius:50%;background:#10B981;border:3px solid #fff;box-shadow:0 2px 8px rgba(16,185,129,.5);}
@keyframes pulse{0%{transform:scale(.4);opacity:1}100%{transform:scale(2.2);opacity:0}}
.leaflet-control-attribution {font-size: 8px !important;opacity: 0.4;background: transparent !important;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:true}).setView([${lat},${lng}],${zoom});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OSM',
  maxZoom:19
}).addTo(map);

var dotIcon=L.divIcon({className:'',html:'<div class="dot"></div>',iconSize:[16,16],iconAnchor:[8,8]});
var userMarker=L.marker([${lat},${lng}],{icon:dotIcon}).addTo(map);
var ringMarker=null;
if (${showPulse ? 'true' : 'false'}) {
  var ringIcon=L.divIcon({className:'',html:'<div class="ring"></div>',iconSize:[36,36],iconAnchor:[18,18]});
  ringMarker=L.marker([${lat},${lng}],{icon:ringIcon,zIndexOffset:-1}).addTo(map);
}

var destMarker=null;
var routeLine=null;
var crimeVisible=true;
var crimeCollection={type:'FeatureCollection',features:[]};
var crimeLayer=L.layerGroup().addTo(map);
var heatLayer=null;

function clearCrimeLayer() {
  crimeLayer.clearLayers();
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer=null;
  }
}

function colorForSeverity(sev) {
  return (${JSON.stringify(severityColors)})[sev] || '#84CC16';
}

function postToRN(payload) {
  try {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  } catch(_) {}
}

function renderCrime() {
  clearCrimeLayer();
  if (!crimeVisible || !crimeCollection || !Array.isArray(crimeCollection.features)) return;

  var z=map.getZoom();
  var pts=[];

  crimeCollection.features.forEach(function(f){
    if (!f || !f.geometry || !f.properties) return;
    if (f.geometry.type==='Point') {
      var c=f.geometry.coordinates;
      var lat=c[1], lng=c[0];
      var p=f.properties || {};
      var sev=p.severity || 'low';
      var radius=p.radius || 300;
      var weight=Math.max(0.2, Math.min(1, (p.count || 1) / 8));
      pts.push([lat,lng,weight]);

      if (z >= 13) {
        var circle=L.circle([lat,lng],{
          radius: radius,
          color: colorForSeverity(sev),
          fillColor: colorForSeverity(sev),
          fillOpacity: 0.28,
          weight: sev==='critical' ? 2.6 : 1.6
        });
        circle.bindPopup((p.label || 'Crime zone') + '<br/>' + (p.count || 1) + ' incident(s)');
        circle.on('click', function() {
          postToRN({ type: 'crime-zone-pressed', zone: p });
        });
        circle.addTo(crimeLayer);
      }
    } else if (f.geometry.type==='Polygon' && z >= 11) {
      var polygon=L.geoJSON(f,{
        style:function(){return{
          color:'#F97316',
          fillColor:'#F97316',
          fillOpacity:0.15,
          weight:1.5
        };}
      });
      polygon.addTo(crimeLayer);
    }
  });

  if (z < 13 && pts.length && typeof L.heatLayer === 'function') {
    heatLayer=L.heatLayer(pts,{radius:22,blur:16,maxZoom:16,minOpacity:0.35});
    heatLayer.addTo(map);
  }
}

map.on('zoomend', renderCrime);

function handleMsg(raw){
  try{
    var m=JSON.parse(raw);
    if(m.type==='loc'){
      userMarker.setLatLng([m.lat,m.lng]);
      if (ringMarker) ringMarker.setLatLng([m.lat,m.lng]);
    }
    if(m.type==='center'){
      map.setView([m.lat,m.lng],m.zoom||${zoom});
    }
    if(m.type==='dest' && ${enableRoute ? 'true' : 'false'}){
      var destIcon=L.divIcon({className:'',html:'<div class="dest"></div>',iconSize:[22,22],iconAnchor:[11,11]});
      if(destMarker) map.removeLayer(destMarker);
      destMarker=L.marker([m.lat,m.lng],{icon:destIcon}).bindPopup(m.name||'Destination').addTo(map);
    }
    if(m.type==='route' && ${enableRoute ? 'true' : 'false'}){
      if(routeLine) map.removeLayer(routeLine);
      var pts=(m.points||[]).map(function(p){return[p.lat,p.lng];});
      routeLine=L.polyline(pts,{color:'#3B82F6',weight:5,opacity:0.85}).addTo(map);
      if (pts.length) map.fitBounds(routeLine.getBounds(),{padding:[40,40]});
    }
    if(m.type==='clear' && ${enableRoute ? 'true' : 'false'}){
      if(destMarker){map.removeLayer(destMarker);destMarker=null;}
      if(routeLine){map.removeLayer(routeLine);routeLine=null;}
    }
    if(m.type==='crime-zones'){
      crimeCollection=m.featureCollection || {type:'FeatureCollection',features:[]};
      renderCrime();
    }
    if(m.type==='toggle-crime-zones'){
      crimeVisible=!!m.visible;
      renderCrime();
    }
  }catch(_){}
}
document.addEventListener('message',function(e){handleMsg(e.data);});
window.addEventListener('message',function(e){handleMsg(e.data);});
</script>
</body>
</html>`;
}

