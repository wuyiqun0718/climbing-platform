// 隐私保护指引：登录页第一次验证手机号前展示，会员同意后才能登录（src/lib/privacy.ts）。
// 完整的指引在小程序后台「用户隐私保护指引」里填（每个岩馆的 AppID 各填一份），这里只是登录页上的摘要。
// 下面标「占位」的要馆方给：运营主体全称、联系方式；指引内容改了就把 version 改一下，所有人重新同意一次。

export interface PrivacyNotice {
  /** 改了指引就换一个值；存下来的同意版本对不上就要重新同意 */
  version: string;
  /** 运营主体（公司全称），占位 */
  operator: string;
  /** 个人信息问题的联系方式，占位 */
  contact: string;
  /** 登录页上列出的收集项：收什么、拿来干什么 */
  items: { what: string; why: string }[];
}

export const PRIVACY: PrivacyNotice = {
  version: '2026-10-21',
  operator: '（占位：运营主体全称）',
  contact: '（占位：联系电话或邮箱）',
  items: [
    { what: '手机号', why: '确认会员身份，找回在前台办过的卡' },
    { what: '入场、购卡、约课记录', why: '扣次、显示卡包和攀爬日历' },
    { what: '身份证号（入场投保时才收）', why: '给当天的攀岩保险投保，会单独再问你一次' },
  ],
};
