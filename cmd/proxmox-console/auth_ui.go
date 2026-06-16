package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
)

type authPageData struct {
	Title          string
	FlowJSON       template.JS
	IsRegistration bool
}

var authTmpl = template.Must(template.New("auth").Parse(authPageHTML))

func fetchKratosFlow(apiPath string, r *http.Request) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", AppConfig.Kratos.BROWSERURL+apiPath, nil)
	if err != nil {
		return nil, err
	}
	for _, c := range r.Cookies() {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kratos returned %d", resp.StatusCode)
	}
	var flow map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&flow); err != nil {
		return nil, err
	}
	return flow, nil
}

func loginUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		http.Redirect(w, r, AppConfig.Kratos.BROWSERURL+"/self-service/login/browser", http.StatusFound)
		return
	}
	flow, err := fetchKratosFlow("/self-service/login/flows?id="+flowID, r)
	if err != nil {
		http.Redirect(w, r, AppConfig.Kratos.BROWSERURL+"/self-service/login/browser", http.StatusFound)
		return
	}
	flowJSON, _ := json.Marshal(flow)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.Execute(w, authPageData{Title: "Sign in", FlowJSON: template.JS(flowJSON), IsRegistration: false})
}

func registrationUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		http.Redirect(w, r, AppConfig.Kratos.BROWSERURL+"/self-service/registration/browser", http.StatusFound)
		return
	}
	flow, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		http.Redirect(w, r, AppConfig.Kratos.BROWSERURL+"/self-service/registration/browser", http.StatusFound)
		return
	}
	flowJSON, _ := json.Marshal(flow)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.Execute(w, authPageData{Title: "Create account", FlowJSON: template.JS(flowJSON), IsRegistration: true})
}

func errorUIHandler(w http.ResponseWriter, r *http.Request) {
	errorID := r.URL.Query().Get("id")
	var flowJSON template.JS = template.JS("{}")
	if errorID != "" {
		flow, err := fetchKratosFlow("/self-service/errors?id="+errorID, r)
		if err == nil {
			b, _ := json.Marshal(flow)
			flowJSON = template.JS(b)
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.Execute(w, authPageData{Title: "Error", FlowJSON: flowJSON})
}

const authPageHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proxmox Console</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#root{height:100%;overflow:hidden}
body{
  font-family:'Inter',system-ui,sans-serif;
  /* ピュアブラックをやめて微細なブルーブラック — 奥行きが生まれる */
  background:#04040a;
  color:#fff;
}

/* ドットグリッド */
.dot-bg{
  background-image:url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.85' fill='%231a1a28'/%3E%3C/svg%3E");
}

/* スキャンライン — 高品位ディスプレイの質感 */
.scanlines{
  position:fixed;inset:0;pointer-events:none;z-index:9997;
  background:repeating-linear-gradient(
    0deg,transparent,transparent 3px,
    rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 4px
  );
}

/* ヴィネット — 周縁を締めて中心に引き込む */
.vignette{
  position:fixed;inset:0;pointer-events:none;z-index:9996;
  background:radial-gradient(ellipse 120% 110% at 50% 50%,
    transparent 40%,rgba(0,0,1,0.65) 100%);
}

/* input */
input{
  -webkit-appearance:none;appearance:none;border-radius:0;
  transition:border-color .2s,box-shadow .2s;
}
input:focus{
  outline:none!important;
  border-color:rgba(255,255,255,0.6)!important;
  box-shadow:0 0 0 3px rgba(255,255,255,0.05),0 0 22px rgba(255,255,255,0.05)!important;
}
input:-webkit-autofill,input:-webkit-autofill:focus{
  -webkit-box-shadow:0 0 0 1000px #0a0a12 inset!important;
  -webkit-text-fill-color:#fff!important;
  transition:background-color 9999s ease-in-out 0s;
}

/* ボタン */
.btn-primary{
  cursor:pointer;
  transition:box-shadow .2s,transform .1s;
}
.btn-primary:not(:disabled):hover{
  box-shadow:0 0 32px rgba(255,255,255,0.25),0 0 64px rgba(255,255,255,0.08);
}
.btn-primary:not(:disabled):active{transform:scale(0.988);}

a{transition:color .15s;}
a:hover{color:#bbb!important;}

/* フェードイン (入場のみ、ループなし) */
@keyframes fade-up{
  from{opacity:0;transform:translateY(12px)}
  to  {opacity:1;transform:translateY(0)}
}
.fu1{animation:fade-up .5s cubic-bezier(.22,1,.36,1) .05s both}
.fu2{animation:fade-up .5s cubic-bezier(.22,1,.36,1) .18s both}
.fu3{animation:fade-up .5s cubic-bezier(.22,1,.36,1) .30s both}
</style>
</head>
<body>

<!-- SVGノイズフィルター — 磨かれた素材のきめ細かな粒子感 -->
<svg style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;opacity:0.038" aria-hidden="true">
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>
<div class="scanlines"></div>
<div class="vignette"></div>
<div id="root"></div>

<script>
var FLOW = {{.FlowJSON}};
var IS_REG = {{.IsRegistration}};
var PAGE_TITLE = "{{.Title}}";

var iconPaths = {
  server:      "M5 4H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1m6 0h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M5 14H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1m6 0h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-2",
  arrowRight:  "M5 12h14M12 5l7 7-7 7",
  alertCircle: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01",
  logOut:      "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

var h = React.createElement;

function Icon(props) {
  return h("svg",{
    width:props.size||16,height:props.size||16,
    viewBox:"0 0 24 24",fill:"none",
    stroke:props.color||"currentColor",
    strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",
    style:Object.assign({flexShrink:0},props.style||{}),
  },h("path",{d:iconPaths[props.name]}));
}

/* ---------- 光沢カード ----------
   ・外枠 div に対角グラデーション border (光が左上から差し込む)
   ・内枠 div に暗い斜めグラデーション (磨かれた鏡面の深み)
   ・上辺の内側ハイライト線 (エッジに光が当たって見える)
*/
function GlossCard(props) {
  return h("div",{
    style:{
      /* 光が左上→右下に流れる光沢 border */
      background:"linear-gradient(148deg," +
        "rgba(255,255,255,0.18) 0%," +
        "rgba(255,255,255,0.06) 25%," +
        "rgba(255,255,255,0.01) 55%," +
        "rgba(255,255,255,0.09) 100%)",
      padding:"1px",
      /* 浮かび上がらせる静的グロー */
      boxShadow:"0 0 55px rgba(255,255,255,0.04),0 0 120px rgba(255,255,255,0.015)",
    }
  },
    h("div",{
      style:Object.assign({
        /* 内面: 左上が微かに明るい磨き面 */
        background:"linear-gradient(160deg,#10101a 0%,#07070f 45%,#04040a 100%)",
        /* 上辺の白いエッジハイライト */
        boxShadow:"inset 0 1px 0 rgba(255,255,255,0.07)",
        padding:"44px 40px 36px",
      }, props.innerStyle||{})
    }, props.children)
  );
}

/* ---------- フォームノード ---------- */
function getNodeMsgs(node){ return node.messages||[]; }
function getGlobalMsgs(){ return ((FLOW.ui||FLOW||{}).messages||[]); }

function InputNode(props) {
  var attrs = props.node.attributes||{};
  var msgs  = getNodeMsgs(props.node);
  var hasErr = msgs.some(function(m){return m.type==="error";});
  var label = (props.node.meta&&props.node.meta.label)
    ? props.node.meta.label.text : attrs.name;

  var kids = [
    h("label",{key:"l",style:{
      display:"block",
      fontSize:10,color:"#777",
      textTransform:"uppercase",letterSpacing:"0.13em",
      userSelect:"none",marginBottom:8,
    }},label),
    h("input",{key:"i",
      type:attrs.type,name:attrs.name,
      defaultValue:attrs.value||"",
      required:attrs.required,disabled:attrs.disabled,
      autoComplete:attrs.autocomplete,
      style:{
        display:"block",width:"100%",
        background:"#0c0c18",
        border:"1px solid "+(hasErr?"#f43f5e":"#2e2e42"),
        color:"#fff",padding:"12px 14px",
        fontSize:14,fontFamily:"inherit",letterSpacing:"0.01em",
      }
    }),
  ];
  msgs.forEach(function(m,i){
    kids.push(h("span",{key:"m"+i,style:{
      display:"block",marginTop:6,
      fontSize:11,color:m.type==="error"?"#f43f5e":"#888",
    }},m.text));
  });
  return h("div",{style:{display:"flex",flexDirection:"column"}},kids);
}

function SubmitNode(props) {
  var attrs = props.node.attributes||{};
  var label = (props.node.meta&&props.node.meta.label)
    ? props.node.meta.label.text : (attrs.value||"Submit");
  return h("button",{
    type:"submit",name:attrs.name,value:attrs.value,
    disabled:attrs.disabled,className:"btn-primary",
    style:{
      width:"100%",marginTop:8,
      padding:"13px 20px",
      background:"#fff",color:"#000",border:"none",
      fontSize:12,fontWeight:700,
      letterSpacing:"0.08em",textTransform:"uppercase",
      fontFamily:"inherit",
      display:"flex",alignItems:"center",justifyContent:"center",gap:9,
    }
  },label,h(Icon,{name:"arrowRight",size:13,color:"#000"}));
}

/* ---------- 左パネル ---------- */
function LeftPanel() {
  return h("div",{
    className:"dot-bg",
    style:{
      width:"54%",minWidth:300,height:"100%",
      /* 左側: 光が左上から差す光沢感 */
      background:[
        "linear-gradient(130deg,rgba(255,255,255,0.025) 0%,transparent 40%)",
        "linear-gradient(310deg,rgba(80,80,160,0.04) 0%,transparent 45%)",
        "url(\"data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.85' fill='%231a1a28'/%3E%3C/svg%3E\")",
        "#04040a",
      ].join(","),
      borderRight:"1px solid #1c1c28",
      display:"flex",flexDirection:"column",justifyContent:"space-between",
      padding:"48px 52px",
      position:"relative",overflow:"hidden",
    }
  },

    /* 巨大ゴーストテキスト */
    h("div",{style:{
      position:"absolute",bottom:-80,left:-16,
      fontSize:280,fontWeight:900,lineHeight:1,
      userSelect:"none",pointerEvents:"none",letterSpacing:"-0.06em",
      color:"transparent",
      WebkitTextStroke:"1px rgba(255,255,255,0.028)",
    }},"PVE"),

    /* 装飾 SVG — 同心円 + クロスヘア */
    h("div",{style:{
      position:"absolute",top:"50%",right:-160,
      transform:"translateY(-50%)",pointerEvents:"none",
    }},
      h("svg",{width:520,height:520,viewBox:"0 0 520 520",fill:"none"},
        [65,125,185,245,305,370].map(function(r,i){
          return h("circle",{key:i,cx:260,cy:260,r:r,
            stroke:"rgba(255,255,255,"+(0.028-i*0.003)+")",strokeWidth:"1"});
        }),
        h("line",{x1:260,y1:210,x2:260,y2:310,stroke:"rgba(255,255,255,0.035)",strokeWidth:"1"}),
        h("line",{x1:210,y1:260,x2:310,y2:260,stroke:"rgba(255,255,255,0.035)",strokeWidth:"1"}),
        /* 外側のダッシュマーク */
        [0,45,90,135,180,225,270,315].map(function(deg,i){
          var rad = deg*Math.PI/180;
          var x1  = 260+370*Math.cos(rad); var y1 = 260+370*Math.sin(rad);
          var x2  = 260+385*Math.cos(rad); var y2 = 260+385*Math.sin(rad);
          return h("line",{key:"t"+i,x1:x1,y1:y1,x2:x2,y2:y2,
            stroke:"rgba(255,255,255,0.06)",strokeWidth:"1"});
        })
      )
    ),

    /* ブランド */
    h("div",{style:{
      display:"flex",alignItems:"center",gap:10,position:"relative",
    }},
      h("span",{style:{fontSize:13,fontWeight:600,letterSpacing:"-0.01em"}},"Proxmox Console"),
      h("span",{style:{fontSize:11,color:"#555",marginLeft:2}},"v1.0")
    ),

    /* ヘッドライン */
    h("div",{style:{position:"relative"}},
      h("div",{style:{
        fontSize:64,fontWeight:200,
        lineHeight:1.04,letterSpacing:"-0.04em",
        color:"#fff",marginBottom:28,
      }},
        "Virtual",h("br"),
        "Infrastructure",h("br"),
        h("span",{style:{color:"#3a3a55"}},"Control.")
      ),
      h("div",{style:{width:24,height:1,background:"rgba(255,255,255,0.1)",marginBottom:20}}),
      h("p",{style:{
        fontSize:13,color:"#666",lineHeight:1.9,maxWidth:285,
      }},
        "Provision virtual machines, orchestrate containers, and monitor your entire Proxmox VE environment from one place."
      )
    ),

    /* フィーチャーリスト */
    h("div",{style:{display:"flex",flexDirection:"column",gap:11,position:"relative"}},
      ["Virtual Machine Management","Container Runtime (LXC)","Storage Orchestration","Network Control"].map(function(name,i){
        return h("div",{key:i,style:{
          display:"flex",alignItems:"center",gap:10,
          fontSize:12,color:"#555",
        }},
          h("span",{style:{width:5,height:5,borderRadius:"50%",background:"#22c55e",flexShrink:0,opacity:0.85}}),
          name
        );
      })
    )
  );
}

/* ---------- 右パネル ---------- */
function RightPanel() {
  var ui     = FLOW.ui||{};
  var nodes  = ui.nodes||[];
  var action = ui.action||"";
  var method = (ui.method||"POST").toUpperCase();
  var gMsgs  = getGlobalMsgs();

  var visible = nodes.filter(function(n){return n.attributes&&n.attributes.type!=="hidden";});
  var hidden  = nodes.filter(function(n){return n.attributes&&n.attributes.type==="hidden";});

  var formKids = [];
  visible.forEach(function(node,i){
    var t = node.attributes&&node.attributes.type;
    formKids.push(t==="submit"
      ? h(SubmitNode,{key:"s"+i,node:node})
      : h(InputNode, {key:"n"+i,node:node})
    );
  });
  hidden.forEach(function(node,i){
    var a=node.attributes||{};
    formKids.push(h("input",{key:"h"+i,type:"hidden",name:a.name,value:a.value||""}));
  });

  return h("div",{style:{
    flex:1,height:"100%",
    display:"flex",alignItems:"center",justifyContent:"center",
    padding:"48px 52px",
    /* 上方から光が差し込む演出 */
    background:[
      "radial-gradient(ellipse 75% 55% at 50% -5%,rgba(255,255,255,0.04) 0%,transparent 65%)",
      "radial-gradient(ellipse 50% 40% at 50% 50%,rgba(255,255,255,0.012) 0%,transparent 55%)",
      "#04040a",
    ].join(","),
    overflowY:"auto",
  }},
    h("div",{style:{width:"100%",maxWidth:360}},

      h("div",{className:"fu1",style:{marginBottom:40}},
        h("div",{style:{
          fontSize:32,fontWeight:200,
          color:"#fff",letterSpacing:"-0.03em",marginBottom:8,lineHeight:1.1,
        }},
          IS_REG ? "Create account" : "Sign in"
        ),
        h("div",{style:{fontSize:12,color:"#777",letterSpacing:"0.01em"}},
          IS_REG ? "Start managing your infrastructure" : "Welcome back to Proxmox Console"
        )
      ),

      gMsgs.length>0 && h("div",{className:"fu2",style:{marginBottom:24}},
        gMsgs.map(function(msg,i){
          var isErr=msg.type==="error";
          var col=isErr?"#f43f5e":(msg.type==="success"?"#22c55e":"#888");
          return h("div",{key:i,style:{
            display:"flex",alignItems:"flex-start",gap:10,
            fontSize:12,color:col,lineHeight:1.65,
            padding:"11px 14px",
            border:"1px solid "+(isErr?"rgba(244,63,94,0.2)":"rgba(255,255,255,0.06)"),
          }},
            isErr&&h(Icon,{name:"alertCircle",size:13,color:col,style:{marginTop:1}}),
            msg.text
          );
        })
      ),

      h("div",{className:"fu3"},
        h(GlossCard,null,
          h("form",{
            action:action,method:method,
            style:{display:"flex",flexDirection:"column",gap:22}
          },formKids),

          PAGE_TITLE!=="Error" && h("div",{style:{
            marginTop:28,paddingTop:22,
            borderTop:"1px solid #1e1e2e",
          }},
            h("a",{
              href:IS_REG?"/login":"/registration",
              style:{fontSize:12,color:"#666",textDecoration:"none",display:"flex",alignItems:"center",gap:6}
            },
              IS_REG?"Already have an account? Sign in":"No account? Create one",
              h(Icon,{name:"arrowRight",size:11,color:"#666"})
            )
          )
        )
      )
    )
  );
}

/* ---------- エラー全画面 (ダッシュボードと同じ構成) ---------- */
function ErrorPage() {
  var error  = FLOW.error||{};
  var msg    = error.message||"An unexpected error occurred.";
  var code   = error.code||"";
  var reason = error.reason||"";

  return h("div",{style:{
    display:"flex",flexDirection:"column",height:"100vh",
    background:"#000",color:"#fff",
    fontFamily:"'Inter',system-ui,sans-serif",
  }},

    /* ヘッダー — ダッシュボードと同一構成 */
    h("div",{style:{
      display:"flex",alignItems:"center",
      padding:"0 32px",height:52,
      borderBottom:"1px solid #111",flexShrink:0,
    }},
      h("a",{href:"/",style:{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}},
        h("span",{style:{fontSize:14,fontWeight:600,color:"#fff",letterSpacing:"-0.01em"}},"Proxmox Console"),
        h("span",{style:{fontSize:11,color:"#333",marginLeft:2}},"v1.0")
      ),
      h("button",{
        "aria-label":"Logout",
        onClick:function(){ window.location.href="/logout"; },
        style:{
          marginLeft:"auto",background:"none",border:"none",
          cursor:"pointer",padding:0,
          display:"flex",alignItems:"center",gap:6,
          color:"#444",fontSize:12,
        }
      },
        h(Icon,{name:"logOut",size:14,color:"#444"}),"Logout"
      )
    ),

    /* ボディ */
    h("div",{style:{
      flex:1,display:"flex",flexDirection:"column",
      justifyContent:"center",
      padding:"0 64px",maxWidth:640,
    }},

      /* HTTPコード */
      code && h("div",{style:{
        fontSize:11,color:"#f43f5e",
        fontFamily:"monospace",letterSpacing:"0.08em",
        marginBottom:16,
      }},"HTTP "+code),

      /* エラーメッセージ — 一目でわかる赤テキスト */
      h("div",{style:{
        fontSize:28,fontWeight:300,
        color:"#f43f5e",letterSpacing:"-0.02em",lineHeight:1.4,
        marginBottom:reason?32:40,
      }},msg),

      /* Reason */
      reason && h("div",{style:{marginBottom:40}},
        h("div",{style:{
          fontSize:10,color:"#444",
          textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,
        }},"Reason"),
        h("div",{style:{fontSize:13,color:"#666",lineHeight:1.75}},reason)
      ),

    )
  );
}

/* ---------- Root ---------- */
function App() {
  if (PAGE_TITLE==="Error") return h(ErrorPage);
  return h("div",{style:{
    display:"flex",height:"100vh",
    background:"#04040a",color:"#fff",
    fontFamily:"'Inter',system-ui,sans-serif",
  }},
    h(LeftPanel),
    h(RightPanel)
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
</script>
</body>
</html>`
