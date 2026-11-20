from pathlib import Path
from html import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
LAYOUT=__import__('json').loads((ROOT/'config/project-layout.json').read_text(encoding='utf-8'))
OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
PDF=OUT/'创作流0.7.1beta-部署与使用说明.pdf'
MD=ROOT/'docs/manuals/0.7.1-beta-部署与使用说明.md'
pdfmetrics.registerFont(TTFont('YaHei','C:/Windows/Fonts/msyh.ttc'))
pdfmetrics.registerFont(TTFont('YaHeiBold','C:/Windows/Fonts/msyhbd.ttc'))
pdfmetrics.registerFontFamily('YaHei',normal='YaHei',bold='YaHeiBold',italic='YaHei',boldItalic='YaHeiBold')
INK=colors.HexColor('#302d36');BLUE=colors.HexColor('#1677ff');MUTED=colors.HexColor('#77717f');LINE=colors.HexColor('#e3e1e7')
styles={
 'title':ParagraphStyle('title',fontName='YaHeiBold',fontSize=28,leading=39,textColor=INK,spaceAfter=14,wordWrap='CJK'),
 'h1':ParagraphStyle('h1',fontName='YaHeiBold',fontSize=20,leading=29,textColor=INK,spaceAfter=15,wordWrap='CJK'),
 'h2':ParagraphStyle('h2',fontName='YaHeiBold',fontSize=12,leading=20,textColor=INK,spaceBefore=12,spaceAfter=6,wordWrap='CJK'),
 'body':ParagraphStyle('body',fontName='YaHei',fontSize=10.5,leading=17,textColor=INK,spaceAfter=8,wordWrap='CJK'),
 'small':ParagraphStyle('small',fontName='YaHei',fontSize=8.5,leading=13,textColor=MUTED,spaceAfter=7,wordWrap='CJK'),
 'cell':ParagraphStyle('cell',fontName='YaHei',fontSize=9,leading=14,textColor=INK,wordWrap='CJK'),
}
story=[];markdown=[];W=A4[0]-100
def para(text,kind='body'):
    story.append(Paragraph(escape(text).replace('\n','<br/>'),styles[kind]));markdown.append(text+'\n')
def title(text,cover=False):
    if story:story.append(PageBreak())
    story.append(Paragraph(escape(text),styles['title' if cover else 'h1']));markdown.append('\n# '+text+'\n')
def head(text):story.append(Paragraph(escape(text),styles['h2']));markdown.append('\n## '+text+'\n')
def steps(items):
    for index,text in enumerate(items,1):para(str(index)+'. '+text)
def table(rows,widths=None):
    data=[[Paragraph(escape(str(value)),styles['cell']) for value in row] for row in rows]
    t=Table(data,colWidths=widths or [W/len(rows[0])]*len(rows[0]),hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#f4f3f7')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.extend([t,Spacer(1,10)])
    markdown.extend(['| '+' | '.join(str(v) for v in row)+' |' for row in rows]);markdown.append('')
def image(name,caption,maxheight=300,width=None):
    file=ROOT/LAYOUT['qaRoot']/'integration/full-qa'/name
    if not file.exists():raise FileNotFoundError(file)
    img=Image(str(file));scale=min((width or W)/img.imageWidth,maxheight/img.imageHeight)
    img.drawWidth=img.imageWidth*scale;img.drawHeight=img.imageHeight*scale;img.hAlign='LEFT'
    story.extend([Spacer(1,5),img,Spacer(1,7),Paragraph(escape(caption),styles['small'])]);markdown.append('配图见 PDF：'+caption+'\n')

title('创作流\n部署与使用说明',True)
para('0.7.1 beta  |  Windows x64 桌面版','h2')
para('本版保留 0.7.0 beta3 的本地项目、任务、日历和审阅界面，并加入局域网协作视频审阅、版本权限、离线同步和桌面小组件联动。员工使用桌面软件，无需在浏览器中工作。')
table([['安装位置','需要做什么'],['公司服务器电脑（1 台）','部署“服务器”文件夹中的协作主机，保持开机并提供公司局域网连接。'],['每位员工电脑','安装“客户端”文件夹中的软件，信任公司主机证书，再用一次性邀请码加入。']],[145,W-145])
head('第一次使用，按这个顺序')
steps(['管理员安装主机，记录主机地址和首个管理员邀请码。','管理员和员工安装客户端；管理员在软件里生成同事的邀请码。','进入公司空间，创建或上传项目，发布视频，为每个版本设置成员权限。'])
image('01-published-review.png','实际桌面界面：原有工作台中直接发布和审阅协作视频。',245)
para('重要：没有固定默认邀请码。邀请码由主机或空间管理员生成，单次使用，10 分钟内有效。','small')

title('01  在服务器电脑安装')
para('仅管理员执行本页。服务器可以是公司现有的一台 Windows 电脑，不需要云服务器。原共享盘目录不会被自动修改或删除。')
steps(['完整解压交付包，在真正的服务器电脑上安装协作管理器。','运行服务器文件夹中的 CreativeFlow-HostManager-Setup-0.7.1-beta-win-x64.exe 安装协作管理器，打开并选择“安装协作主机”。','填写公司空间名称、管理员姓名、服务器计算机名，并分别选择服务器程序和协作数据的位置。','等待安装结束。窗口会显示主机地址，例如 https://VIDEO-SERVER:47840，以及首个管理员邀请码。','妥善记录管理员邀请码，在 10 分钟内加入；过期后按本说明最后一页重新生成。','在管理器“员工接入中心”导出公司接入文件，通过公司可信渠道分发；为每位员工单独生成邀请码。','服务器使用可信的专用网络或公司域网络，并保持开机。安装工具仅为本地子网开放 HTTPS 端口。'])
table([['项目','默认位置'],['主机程序','C:\\Program Files\\CreativeFlow Host'],['空间数据与视频','C:\\ProgramData\\CreativeFlow Host'],['主机连接','https://服务器计算机名:47840']],[125,W-125])
para('发布视频会复制一份到主机的专用受控目录，原始文件仍在原位置。请按视频规模预留主机磁盘空间，不要把受控数据目录重新共享给所有员工。')
para('已有主机时不要再次初始化。请在管理器中接管或升级现有主机；它会先完整备份、保留旧程序，再迁移旧协作资料。','small')

title('02  员工安装并加入公司')
steps(['运行“客户端 / CreativeFlow-Setup-0.7.1-beta-win-x64.exe”，按向导安装；也可使用 Portable 便携版。两者任选其一。','打开创作流，选择加入公司协作空间，点击“导入公司接入文件”，选择管理员提供的 .cfspace 文件，确认公司与证书信息后配置信任。信任仅用于创作流协作连接，无需手工安装 Windows 证书。','打开创作流，点击标题栏“我的项目”，填写管理员提供的主机地址、6 位邀请码和自己的姓名，点击“验证并加入”。','加入后自动进入公司空间。主窗口与小组件会同步切换空间；有未保存意见时先选择保存、放弃或继续编辑。'])
head('空间容量与上传限制')
para('客户端设置中的协作空间容量显示当前可上传量；管理员可看到详细占用。新主机默认空间上限 100 GB、磁盘最低剩余 20 GB，由协作管理器调整。已有主机请先在管理器升级，再确认容量设置。上传前容量不足会明确提示，不会替换原视频；已有版本、归档和回收站仍计入占用，不会自动删除。')
head('从本地 0.7.0 beta3 升级')
para('先在旧版本导出本地 JSON 备份，退出主窗口和小组件，再安装新版到原位置。新版沿用本地数据存储；本地项目不会自动上传。安装程序不会替你覆盖公司空间。')
head('选择“我的项目”还是公司空间？')
table([['我的项目','公司空间'],['只在当前电脑保存，主机离线时照常使用。','项目、排期、视频版本和意见在公司主机上共享。'],['保留原有本地图片、PPT、视频等文件关联功能。','协作媒体审阅支持 MP4、M4V、WebM、MOV 视频。'],['上传时保留原项目。','上传后产生独立协作副本；后续协作请在公司空间中操作。']])
para('不要把地址自行换成 127.0.0.1 或其他 IP。请使用安装工具给出的服务器名称地址，避免连接到自己的电脑或导致证书名称不匹配。')

title('03  建立和上传协作项目')
head('新建项目')
para('进入公司空间后，沿用原有“新建项目 → 新增任务 → 新增版本”的操作。项目和任务支持排期、颜色、备注及修改意见；日历、甘特图、今日和小组件读取同一份协作资料。')
head('上传已有本地项目')
steps(['切换到“我的项目”，打开左上角“创作流”菜单，选择“上传本地项目资料”。','选择本地项目和目标公司空间。项目、任务、版本、排期、备注和意见会一并提交。','如需发布已关联的本地视频，勾选“同时发布已关联的本地视频文件”。发布前核对显示的文件路径；需要主机在线。','点击确认，完成后切换到公司空间。底部状态显示是否还有待同步操作。随后进入审阅页分配版本成员权限。'])
para('上传保留本地原项目，并建立独立协作副本。本地原项目之后的修改不会自动覆盖协作副本。重复主动上传会建立另一份副本；更新协作视频应在已有协作任务中新增版本。')
head('版本更新与项目管理')
para('在自己的剪辑软件中完成修改，导出新视频，再在协作任务中新建 V2、V3。可选择继承上一版本的未完成意见；新旧版本独立，已经完成的意见不会自动复制。新版本默认不向其他成员开放，需要重新授权。')
para('“项目归档与回收站”位于应用菜单。归档会从日常视图收起项目，可随时取消归档。删除项目后，管理者可以在回收站恢复同一次删除的项目层级和意见；原共享盘文件不会被删除。')

title('04  发布视频与设置权限')
steps(['在审阅中心选择任务和版本，点击“进入审阅”。','点击“发布协作视频”，选择本地视频并等待发布完成。视频保存到主机，员工无需映射相同盘符。','点击“成员权限”，为每位成员选择权限，再点击该成员旁的“保存权限”。','请同事进入同一公司空间，在审阅中心打开获授权的版本。'])
table([['权限','可执行的操作'],['不可见','不能读取该版本的视频或意见。'],['仅查看','播放视频、阅读意见。'],['可批注','另可添加、修改、删除并处理自己的意见。'],['可编辑','另可处理所有意见、修改版本资料、发布或替换视频。'],['可管理','另可设置该版本成员权限、删除该版本。']],[90,W-90])
image('03-permission-dialog-detail.png','每个版本独立设置权限；固定管理权限不会被普通授权覆盖。',255,width=355)
para('空间所有者、项目创建者和版本创建者保留管理能力。新建任务及新增其他版本仍需项目管理权限。“可编辑”不代表可以在本软件内剪辑画面。','small')

title('05  多人审阅与意见处理')
steps(['播放视频，可暂停、拖动进度、调整速度；点击时间码可以跳到对应画面。','点击“添加修改意见”，选择“时间点意见”或“整体意见”，输入内容后点击“添加”。','点击意见正文可以编辑；有权限时可勾选完成、重新打开或删除。意见和处理状态会同步到同事及其他面板。','修改后导出新视频，建议新增版本再发布，以保留上一轮的审阅记录。'])
table([['常用操作','快捷键或入口'],['播放 / 暂停','Space'],['添加当前时间点意见','M'],['前后移动 5 秒','方向键'],['保存意见','Ctrl+Enter'],['取消或处理当前编辑','Esc'],['撤销 / 重做','Ctrl+Z / Ctrl+Shift+Z，或顶部箭头']],[140,W-140])
para('每个人独立播放，播放位置不会强制改变同事的进度。共享的是版本资料、意见和处理状态；自己的播放位置、筛选和界面状态保存在本机。')
para('审阅成员只能按版本授权操作。只有“可批注”时，其他人意见的修改和完成入口会受限；项目与任务资料可查看，但由项目管理者维护。')
head('谁上传了视频？')
para('审阅页标题区域显示版本创建者、当前权限和视频发布者；项目动态记录相关成员的实际操作。显示名称用于识别，权限与内部成员身份绑定，不会仅凭填写一个相同姓名获得权限。')
para('单个视频上限 20 GB。推荐发布 H.264 编码的 MP4，WebM 已完成实际播放验证；MOV 或其他视频中的编码能否播放取决于播放器支持。','small')

title('06  断网与同步冲突')
para('已同步的项目资料可在离线时查看和修改。点击保存的操作会先写入本机持久化队列，退出并重新打开软件后仍保留；恢复网络会自动继续发送。视频在线播放、发布和权限管理需要连接主机。')
steps(['查看底部状态：“已同步”表示主机已确认；“离线已保存 / 待同步”表示仍在本机等待发送。','出现冲突时，打开“协作同步中心”，核对“修改前 / 我的修改 / 主机当前”。','可以重试原操作；符合条件时明确选择“采用我的修改”；或先导出离线草稿，再放弃待同步修改并保留主机内容。'])
image('02-sync-dialog-detail.png','同步中心保留双方内容，处理前不会自动覆盖同事的修改。',380,width=W)
para('放弃时会清除这笔及后续待同步操作，界面会显示数量并要求确认。主机恢复备份后，旧队列不会直接写回；请先导出草稿再人工核对。未点击保存的编辑文字也会作为本机草稿保留，可在同步中心导出。','small')

title('07  小组件、日历与个人工作')
para('从应用菜单选择“显示桌面小组件”。小组件提供项目计划和修改意见两个视图，可按月、周、日查看，右上角图钉切换置顶。')
image('04-widget.png','小组件与主窗口共享工作资料和待同步队列，底部显示当前空间和同步状态。',300,width=440)
steps(['在小组件中双击意见正文编辑，保存后会更新主窗口及有权限的同事；勾选完成同样同步。','切换公司空间时，两窗口先处理未保存内容。选择“继续编辑”会取消切换，草稿不会被直接丢弃。','日历和甘特图仍沿用本地版操作；公司空间中的排期修改也进入同一同步队列，离线时先在本机保存。'])
para('想继续个人工作，切回“我的项目”即可。主机离线不会阻止使用本地功能。个人文件与本地项目不会因为加入公司而自动上传。')

title('08  成员、备份与常见问题')
head('管理员日常维护')
para('“空间成员与邀请码”中可邀请新同事，为已有成员生成“新设备邀请码”，或移除成员。移除后，其设备不能继续访问主机。新设备邀请码保留原成员身份，适合换电脑或重新加入。')
para('个人项目：在“我的项目”中导出 JSON 备份。公司空间的“导出当前可见资料”只包含当前身份可见的数据，不是公司完整备份，也不包含视频。')
para('主机完整备份：以管理员身份在“服务器”文件夹运行 Backup-Host.ps1。它会短暂停服，复制数据库、主机视频及配置并校验；默认放在主机数据目录的 backups 下。备份含私钥和配置，请保存在受控目录。')
para('恢复：管理员运行 Restore-Host.ps1 -BackupPath "完整备份文件夹"，核对后输入 RESTORE。恢复前数据会另存，不会直接销毁；身份失效的成员使用新设备邀请码重新加入。')
table([['遇到的问题','处理方法'],['邀请码是多少？','没有固定码。管理员在软件里生成，初次管理员码在主机安装窗口显示；单次使用、10 分钟有效。'],['初次管理员邀请码过期','在协作管理器中生成管理员接入恢复码。'],['主机连不上或证书错误','确认主机开机、同一局域网，使用安装工具给出的名称地址，并在客户端导入管理员提供的公司接入文件。'],['进入空间却看不到视频','请管理者为具体版本授权。新建版本默认不向其他成员开放。'],['文字已保存但同事没看到','查看底部待同步数量，打开同步中心检查连接、冲突或权限变化。'],['旧独立协作版升级','先备份、升级主机并迁移资料，再升级员工客户端。旧表和原素材保留，原共享盘视频需要在新审阅页重新发布。']],[130,W-130])
para('本版已在 Windows 11 x64 隔离环境验证 51 项自动化测试及多客户端真实桌面流程。公司实际网络、主机权限和跨电脑部署仍需按本文进行现场测试。单次资料操作最多 5000 项、8 MB 文字；视频通过独立流式通道发布。','small')

def footer(c,doc):
    c.saveState();c.setStrokeColor(LINE);c.line(50,40,A4[0]-50,40)
    c.setFont('YaHei',8);c.setFillColor(MUTED);c.drawString(50,27,'创作流  0.7.1 beta  |  部署与使用说明');c.drawRightString(A4[0]-50,27,f'第 {doc.page} 页');c.restoreState()
doc=SimpleDocTemplate(str(PDF),pagesize=A4,rightMargin=50,leftMargin=50,topMargin=45,bottomMargin=55,title='创作流 0.7.1 beta 部署与使用说明',author='CreativeFlow')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
MD.write_text('\n'.join(markdown),encoding='utf-8')
print(PDF)
