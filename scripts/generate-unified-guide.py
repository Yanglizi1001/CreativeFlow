from pathlib import Path
from html import escape
import json
from reportlab.platypus import SimpleDocTemplate, Paragraph, Image, Spacer, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parents[1]
layout=json.loads((root/'config/project-layout.json').read_text(encoding='utf-8'))
out=root/'output/pdf/创作流-内置协作管理使用说明.pdf';out.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('UnifiedText','C:/Windows/Fonts/msyh.ttc'))
pdfmetrics.registerFont(TTFont('UnifiedBold','C:/Windows/Fonts/msyhbd.ttc'))
styles={k:ParagraphStyle(k,fontName='UnifiedBold' if k in ['title','heading'] else 'UnifiedText',fontSize=s,leading=l,spaceAfter=10,textColor=colors.HexColor('#3a3044'),wordWrap='CJK') for k,s,l in [('title',23,32),('heading',12,20),('body',10,18),('caption',8,13)]}
story=[];markdown=['# 创作流：内置协作管理使用说明\n','0.7.1 beta · 2026-11-21 · Windows x64\n']
def p(text,kind='body'):
    story.append(Paragraph(escape(text),styles[kind]));markdown.append(('## ' if kind=='title' else '### ' if kind=='heading' else '')+text+'\n')
def page(title):
    if story:story.append(PageBreak())
    p(title,'title')
def shot(name,caption):
    file=root/layout['qaRoot']/'integration/unified-manager'/name
    img=Image(str(file));factor=min(490/img.imageWidth,230/img.imageHeight);img.drawWidth*=factor;img.drawHeight*=factor;img.hAlign='LEFT';story.extend([img,Spacer(1,8)]);p(caption,'caption')
page('一个创作流，完成日常工作与协作管理')
p('只需安装或运行创作流。协作管理器、主机服务安装资源和离线运行环境均已内置，不再另装独立管理器。安装版和免安装版包含相同功能。')
p('从“创作流”应用菜单选择“协作管理器”，或在“设置 / 公司空间与连接”点击“打开协作管理器”。管理窗口独立显示，重复点击会唤起已有窗口。')
shot('employee-entry.png','示例：普通权限入口。日常项目与审阅无需 Windows 管理员权限。')
p('员工如何加入公司空间','heading')
p('点击“配置当前电脑接入”，回到主窗口，导入管理员发来的 .cfspace 公司接入文件，核对公司、主机地址和证书指纹，确认应用信任，再填写姓名和一次性邀请码。已有身份可直接切换，无需重新加入。')
p('邀请码没有固定默认值，单次使用、10 分钟有效；过期后请管理员重新生成。不要通过反复更换邀请码处理网络或证书问题。员工电脑通常不需要授权管理本机，也不要重复建立公司空间。')
page('本机主机：安装、接管与日常协作')
p('管理器顶部明确显示“管理对象：本机主机”。它管理当前电脑的服务，不会因为已连接某个公司空间而获得远程服务器管理权。')
p('点击“授权管理本机”并确认 Windows 管理员授权后进入完整管理模式。只有管理窗口以管理权限运行，主窗口继续按原权限工作。取消授权后返回入口，不修改原服务或资料。')
shot('integrated-host-overview.png','示例：授权后的七个管理页面，沿用原有风格和构成。')
p('首次部署','heading')
p('在真正的服务器电脑选择“安装协作主机”，填写公司、管理员和主机名称，分别选择程序路径与数据路径。数据目录需要本机 NTFS 磁盘，不能使用共享盘、映射盘或目录链接。安装后在“员工接入中心”导出接入文件，并在“空间与成员”分别生成邀请码。')
p('已有服务','heading')
p('管理器会识别原服务路径与原数据位置；需要时使用“接管现有主机”，不要重新建立空间。升级现有主机会先完整备份再更新程序；本次管理窗口集成本身不要求替换已配套的主机服务。')
p('服务器同时参与协作','heading')
p('点击“在主窗口打开此协作空间”。已有接入身份时正常切换；尚未加入时预填本机地址，仍需按正常流程确认证书与成员身份。Windows 管理权限不会自动赋予视频版本权限。')
page('保留的管理功能与操作保护')
for title,text in [
('运行概览','查看服务、连接地址、空间信息与存储位置，启动、停止、安装或接管主机。'),
('空间与成员','修改空间与管理员名称，邀请、重置邀请码、停用或移除成员、管理设备和所有者身份。成员历史意见保留原有归属。'),
('员工接入中心','导出公开接入文件并查看接入步骤。接入文件不包含私钥、数据库、访问令牌或邀请码。'),
('网络检测','检查服务、端口、本机接口、网络类型、防火墙、名称解析和证书，并导出检测报告。检测本机正常不代表每台员工电脑都已连接。'),
('存储与备份','分别管理程序和数据路径，创建完整备份、设置定时备份、校验恢复、迁移程序与数据。备份包含视频与私钥，应保存在受保护的位置。'),
('存储用量','设置空间上限和最低磁盘余量，查看占用。超限不自动删除项目；清理入口只清理由系统核对后不再引用的视频。回收站仍计入占用。'),
('设置与维护','管理服务自启、软件及管理窗口启动选项，升级主机、导出故障报告，卸载服务并选择保留数据或确认删除。')]:
    p(title,'heading');p(text)
p('停止、升级、恢复、迁移和卸载等操作保留确认步骤；维护进行中阻止误关管理窗口。主窗口隐藏到托盘后管理窗口可继续使用，关闭管理窗口不会停止后台服务。主机维护期间的离线修改按原同步与冲突规则处理。')
page('启动设置、旧版迁移与卸载')
p('三个启动选项分别控制','heading')
p('“随 Windows 启动协作服务”控制后台服务；“登录 Windows 后启动创作流”控制当前用户的普通软件窗口；“启动后自动打开协作管理窗口”控制创作流启动后的管理窗口。主窗口与管理窗口中的后两项保持同步，默认关闭。')
p('从独立管理器迁移','heading')
p('先更新创作流并确认内置管理器能识别原主机。原服务程序、数据、证书、成员、容量和备份配置沿用原位置，不自动上传本地项目。确认接管成功后，只卸载旧的“创作流协作管理器”软件，不执行“卸载协作服务”。已启用旧管理器登录自启时，需要迁移到创作流的启动选项后再移除旧入口。')
p('卸载软件与卸载主机服务','heading')
p('移除旧独立管理器只清理旧管理程序及其专用启动入口，后台主机服务与公司数据保留。以后卸载创作流也不自动删除协作服务与数据；管理员应在内置管理器中明确选择是否卸载服务、是否保留数据。永久删除需要输入确认文字，不能撤销。')
p('常见情况','heading')
p('授权取消：重新点击“授权管理本机”，在 Windows 弹窗确认。看不到主机：先确认当前电脑是否为真正的服务器。主窗口已退出：先打开创作流，再从菜单唤起已有管理窗口。视频看不到：检查自己的空间身份、版本权限和主机连接，Windows 管理授权不替代成员授权。')
p('验证范围','heading')
p('集成窗口与原有本地、多人协作功能使用隔离配置和示例空间验证；界面授权取消、服务控制与启动设置在测试中使用适配器，成员操作使用真实临时主机。真实管理员安装迁移另以本机升级记录为准，跨电脑网络仍需在公司环境核对。本说明截图均为示例资料。')
def footer(canvas,doc):
    canvas.setFont('UnifiedText',8);canvas.setFillColor(colors.HexColor('#887994'));canvas.drawString(48,28,'创作流 0.7.1 beta · 内置协作管理');canvas.drawRightString(A4[0]-48,28,str(doc.page))
SimpleDocTemplate(str(out),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=40,bottomMargin=45).build(story,onFirstPage=footer,onLaterPages=footer)
(root/'docs/manuals/0.7.1-beta-内置协作管理使用说明.md').write_text('\n'.join(markdown),encoding='utf-8')
print(out)
