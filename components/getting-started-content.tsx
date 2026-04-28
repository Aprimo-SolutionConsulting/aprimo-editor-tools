"use client"

import Image from "next/image"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function GettingStartedContent() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-lg text-muted-foreground">
            Connect your Aprimo environment and start managing your DAM configuration.
          </p>
        </div>

        <div className="space-y-12">
          {/* Step 1 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              1. Configure Aprimo Registration
            </h2>
            <p className="text-muted-foreground mb-6">
              In your Aprimo tenant, create a client registration for this tool. Choose the OAuth flow type that matches how you want to authenticate.
            </p>

            <Tabs defaultValue="client-credential" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="client-credential">Client Credential</TabsTrigger>
                <TabsTrigger value="pkce">Authorization Code with PKCE</TabsTrigger>
              </TabsList>

              <TabsContent value="client-credential" className="space-y-4">
                <p className="text-muted-foreground">
                  Use the Client Credential flow for service-to-service authentication. Capture the Client ID and Client Secret after saving.
                </p>
                <p className="text-sm text-muted-foreground italic">
                  Note: Be sure to select a user with the rights you need.
                </p>
                <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
                  <Image
                    src="/images/client-credential.png"
                    alt="Client Credential Setup"
                    fill
                    className="object-contain"
                  />
                </div>
              </TabsContent>

              <TabsContent value="pkce" className="space-y-4">
                <p className="text-muted-foreground">
                  Use Authorization Code with PKCE for user-context login. Set the Redirect URL to{" "}
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                    {"https://<your-app>/oauth/callback"}
                  </code>{" "}
                  and optionally enable refresh tokens.
                </p>
                <p className="text-sm text-muted-foreground italic">
                  Note: As this registration uses a callback, you either need to configure one for development or use client credentials for development.
                </p>
                <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
                  <Image
                    src="/images/pkce-auth.png"
                    alt="PKCE Auth Setup"
                    fill
                    className="object-contain"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Step 2 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              2. Connect to Aprimo
            </h2>
            <p className="text-muted-foreground">
              Head to the Connect page and authenticate with your Aprimo tenant using OAuth.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              3. Verify your connection
            </h2>
            <p className="text-muted-foreground">
              Once connected, the status indicator in the navigation bar will display your active environment.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              4. Start building
            </h2>
            <p className="text-muted-foreground">
              Use the available SDK to start building your app.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
