export default function TermsPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Terms of Service
        </h1>
        <div className="mt-10 text-base leading-7 text-slate-600 space-y-6">
          <p>
            Last updated: {new Date().toLocaleDateString()}
          </p>
          <p>
            Please read these Terms of Service carefully before using FlowSales AI operated by us.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the Service.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">2. Description of Service</h2>
          <p>
            FlowSales AI is a CRM designed to assist small and medium-sized enterprises in managing their leads, quotes, and customer communications.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. User Responsibilities</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Limitation of Liability</h2>
          <p>
            In no event shall FlowSales AI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages.
          </p>
        </div>
      </div>
    </div>
  );
}
