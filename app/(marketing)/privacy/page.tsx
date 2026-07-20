export default function PrivacyPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <div className="mt-10 text-base leading-7 text-slate-600 space-y-6">
          <p>
            Last updated: {new Date().toLocaleDateString()}
          </p>
          <p>
            At FlowSales AI, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our service.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
          <p>
            We collect information that you provide directly to us, such as when you create an account, fill out a form, or communicate with us. This includes your name, email address, company details, and any other information you choose to provide.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to operate and maintain our service, communicate with you, and improve our offerings. We may also use your information for marketing purposes, with your consent where required by law.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your personal information. However, please note that no method of transmission over the Internet or electronic storage is 100% secure.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at support@flowsales.ai.
          </p>
        </div>
      </div>
    </div>
  );
}
