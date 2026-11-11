import { dateKey, parseDate } from './dates';
export function demoDatabase() {
 const today=dateKey();const day=offset=>{const d=parseDate(today);d.setDate(d.getDate()+offset);return dateKey(d);};
 const row=(id,time,text,done=false)=>({id,time,text,done,status:done?'done':'todo'});
 const list=(id,name,items)=>({id,name,items});
 const video={name:'创作流_审阅演示.webm',demo:'video',size:'内置示例视频'};
 const version=(id,name,status,lists,file=null)=>({id,name,status,createdAt:day(-2),file,lists,...(file?.demo==='video'?{duration:18}: {})});
 return {schema:2,preferences:{compact:true,planMode:'week',customOptions:{projectStatuses:[],projectTypes:['脚本'],taskStages:['待配音']}},projects:[{
 id:'demo-project',name:'示例项目 · 新品发布创意全案',description:'从计划到交付：展开任务、切换版本、审阅视频并逐条处理意见。',type:'视频',status:'进行中',color:'#1677ff',start:day(-4),due:day(8),
 notes:'欢迎体验创作流 Beta！这个项目中的内容可自由修改或删除。\n\n建议按以下顺序体验：\n1. 单击任务行展开预览，双击进入任务。\n2. 主宣传片有 V1 / V2，可切换版本，按自检、内部审核、客户反馈处理意见。\n3. 点击「审阅」播放内置演示视频，点击时间码定位，或添加当前时间的意见。\n4. 日历查看连续排期，甘特查看项目与任务周期；点击日期空白处查看当日计划。\n5. 修改意见中心跨任务处理意见，设置中打开桌面小组件观察同步。\n6. 新增版本可继承未完成意见；删除单条意见后可撤销。\n7. 项目与任务详情中编辑日期、备注和自定义标签，最近动态会记录真实操作。\n8. 设置中导出备份，换电脑时导入；你自己的素材文件需单独复制。\n\n图片和视频已内置。PPT 和脚本任务留有空版本，便于练习关联自己的文件。',
 activities:[{id:'demo-activity',at:'示例说明',text:'示例展示版本、审阅、任务阶段、连续排期和修改清单；后续操作将记录真实动态。'}],
 tasks:[
 {id:'demo-main',name:'主宣传片 · 版本与审阅',type:'视频',status:'客户审核',start:day(-3),due:day(2),notes:'点击审阅即可播放内置的 18 秒示例视频。V1 已完成，V2 保留不同来源的意见。',versions:[
 version('demo-v1','V1','已完成',[list('demo-first','首轮自检',[row('d1','','确认项目名称和交付规格',true),row('d2','00:03','检查开场标题',true)])],video),
 version('demo-v2','V2','进行中',[
 list('demo-self','自检',[row('d3','','检查导出文件名与画面比例',true),row('d4','00:02','确认开场标题居中')]),
 list('demo-internal','内部审核',[row('d5','00:07','检查第二段说明的阅读时间'),row('d6','00:10','确认蓝色背景与文字对比',true)]),
 list('demo-client','客户反馈 · 第一轮',[row('d7','00:13','检查第三段文字是否清楚'),row('d8','00:16','片尾信息再核对一次')])],video)]},
 {id:'demo-social',name:'短视频剪辑 · 修改清单',type:'视频',status:'修改中',start:day(-1),due:today,notes:'展示今天到期的任务、勾选意见及修改阶段。可把未完成意见继承到新版本。',versions:[version('demo-social-v1','V1','进行中',[list('demo-social-list','剪辑调整',[row('d9','00:04','精简第一段停顿'),row('d10','00:12','核对片尾字幕',true)])],video)]},
 {id:'demo-cover',name:'发布封面图 · 图片交付',type:'图片',status:'内部审核',start:day(-2),due:day(1),notes:'点击系统打开可查看内置封面图片，也可取消关联并选择自己的图片。',versions:[version('demo-cover-v1','V1','进行中',[list('demo-cover-list','设计自检',[row('d11','','检查标题对齐与留白'),row('d12','','确认图片尺寸与清晰度',true)])],{name:'创作流_发布封面.png',demo:'cover',size:'内置示例图片'})]},
 {id:'demo-ppt',name:'发布会提案 · PPT',type:'PPT',status:'前期策划',start:today,due:day(5),notes:'练习关联自己的 PPT 文件。此任务展示不同交付类型和非视频意见。',versions:[version('demo-ppt-v1','V1','进行中',[list('demo-ppt-list','内容大纲',[row('d13','','补充项目目标与交付清单'),row('d14','','整理方案与排期说明')])])]},
 {id:'demo-script',name:'配音脚本 · 自定义类型',type:'脚本',status:'待配音',start:day(1),due:day(4),notes:'「脚本」与「待配音」是自定义标签。下拉菜单中输入文字即可添加自己的类型或阶段。',versions:[version('demo-script-v1','V1','进行中',[])]},
 {id:'demo-done',name:'需求确认 · 已交付',type:'图片',status:'已交付',start:day(-4),due:day(-2),notes:'用于展示已交付任务与已完成版本。示例项目仍在进行，子任务可处于不同阶段。',versions:[version('demo-done-v1','V1','已完成',[list('demo-done-list','需求确认',[row('d15','','确认交付规格与时间',true)])])]}]}]};
}
