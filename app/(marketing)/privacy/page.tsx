export default function PrivacyPage() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <div className="mt-10 text-base leading-7 text-slate-600 space-y-6">
          <p>
            Last updated: August 9, 2026
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
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">3. Meta, Instagram and Messenger Data</h2>
          <p>
            When a business connects its own Instagram Professional Account or Facebook Page, FlowSales AI receives the account identifier and access token needed to operate the connection. We use Meta data only to provide the connected business&apos;s inbox: receive customer messages, show them to authorized business users, and send replies that those users request.
          </p>
          <p>
            For incoming conversations we may store the sender&apos;s platform identifier, a display name when supplied by Meta, message text, message identifiers, timestamps, delivery state, and attachment URLs. We do not use Meta customer message content for advertising or sell Meta data. Access tokens are encrypted at rest and are not shown in the application or written to application logs.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">4. Retention, Disconnection and Deletion</h2>
          <p>
            Data is retained while the customer&apos;s FlowSales workspace needs it to provide the inbox, unless a shorter legal retention period applies. Disconnecting an Instagram or Facebook integration immediately deletes its stored access token. A workspace owner can request export or deletion from Account → Data. Individuals whose Meta data appears in a connected inbox can request deletion at support@flowsales.ai; we verify the request and delete data we can associate with that Meta identifier.
          </p>
          <p>
            Meta users can also initiate a deletion request through Meta&apos;s Data Deletion Callback. FlowSales AI verifies the signed request, removes matching Instagram or Messenger inbox data where it is identifiable, and returns a confirmation status URL.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">5. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your personal information. However, please note that no method of transmission over the Internet or electronic storage is 100% secure.
          </p>
          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">6. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at support@flowsales.ai.
          </p>
        </div>
      </div>
    </div>
  );
}
