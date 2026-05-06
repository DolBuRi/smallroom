'use client';

import { Mail, MessageCircle, HelpCircle } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="container-custom py-24">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-black text-slate-900 mb-6">문의하기</h1>
        <p className="text-slate-500 text-lg mb-12 leading-relaxed">
          기능 제안, 버그 제보 또는 궁금한 점이 있으시면 언제든지 문의해 주세요.<br />
          보내주신 의견은 서비스 개선에 큰 도움이 됩니다.
        </p>

        <div className="grid grid-cols-1 gap-6 text-left">
          <ContactCard 
            icon={<Mail className="text-indigo-600" />}
            title="이메일 문의"
            description="가장 빠른 공식 답변을 받으실 수 있습니다."
            value="lcwoo3145@gmail.com"
          />
          <ContactCard 
            icon={<MessageCircle className="text-green-500" />}
            title="커뮤니티 / 단톡방"
            description="레기온 멤버들과 실시간으로 소통하세요."
            value="아리엘 서버 - 츄 레기온 공지방"
          />
          <ContactCard 
            icon={<HelpCircle className="text-amber-500" />}
            title="도움말"
            description="자주 묻는 질문은 소개 페이지를 참고해 주세요."
            value="FAQ 바로가기"
            link="/"
          />
        </div>

        <div className="mt-16 p-8 bg-slate-100 rounded-3xl text-sm text-slate-500">
          <p className="font-bold mb-2">💡 문의 시 참고사항</p>
          <ul className="list-disc list-inside space-y-1 text-left inline-block">
            <li>사용 중인 기기 정보 (PC/모바일)를 함께 적어주시면 빠른 확인이 가능합니다.</li>
            <li>스크린샷이나 재현 방법을 포함해 주시면 정확한 파악에 도움이 됩니다.</li>
            <li>개인정보(비밀번호 등)는 절대 포함하지 마세요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ContactCard({ icon, title, description, value, link }: { icon: React.ReactNode, title: string, description: string, value: string, link?: string }) {
  const content = (
    <div className="flex items-center gap-6 p-8 bg-white border border-slate-200 rounded-2xl card-hover">
      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 mb-2">{description}</p>
        <p className="font-black text-indigo-600">{value}</p>
      </div>
    </div>
  );

  if (link) {
    return <a href={link}>{content}</a>;
  }
  return content;
}
