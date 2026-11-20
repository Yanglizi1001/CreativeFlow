export const PERMISSIONS={none:'不可见',view:'仅查看',comment:'可批注',edit:'可编辑',manage:'可管理'};
const levels={none:0,view:1,comment:2,edit:3,manage:4};
export function can(flow,entity,permission='edit') {
  if(!flow.space)return true;
  return (levels[entity?.collaboration?.permission]||0)>=levels[permission];
}
export function canEditOpinion(flow,version,item) {
  return !flow.space||can(flow,version,'edit')||can(flow,version,'comment')&&item.collaboration?.createdBy===flow.space.memberId;
}
