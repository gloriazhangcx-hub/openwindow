import { ClerkProvider, Show, SignIn, SignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import OpenWindowWorkspace from "./App";
import { basePath } from "./lib/clerk-config";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#5b4699",
    colorForeground: "#29243c",
    colorMutedForeground: "#766f84",
    colorDanger: "#b45e50",
    colorBackground: "#fffefa",
    colorInput: "#fbf9fd",
    colorInputForeground: "#40316f",
    colorNeutral: "#e2dceb",
    fontFamily: '"DM Sans", sans-serif',
    borderRadius: "0.8rem",
  },
  elements: {
    rootBox: { width: "100%", display: "flex", justifyContent: "center" },
    cardBox: {
      width: "min(100%, 440px)",
      background: "#fffefa",
      border: "1px solid #e2dceb",
      borderRadius: "18px",
      boxShadow: "0 18px 50px rgba(53, 39, 83, .11)",
      overflow: "hidden",
    },
    card: { boxShadow: "none", border: "0", background: "transparent" },
    footer: { boxShadow: "none", border: "0", background: "transparent" },
    headerTitle: { color: "#40316f", fontFamily: "Newsreader, serif" },
    headerSubtitle: { color: "#766f84" },
    socialButtonsBlockButtonText: { color: "#40316f", fontWeight: "600" },
    formFieldLabel: { color: "#514080", fontWeight: "700" },
    footerActionLink: { color: "#5b4699", fontWeight: "700" },
    footerActionText: { color: "#766f84" },
    dividerText: { color: "#766f84" },
    identityPreviewEditButton: { color: "#5b4699" },
    formFieldSuccessText: { color: "#47745a" },
    alertText: { color: "#9d4c40" },
    logoBox: { paddingBottom: "8px" },
    logoImage: { maxHeight: "36px", width: "auto" },
    socialButtonsBlockButton: {
      border: "1px solid #e2dceb",
      borderRadius: "10px",
      background: "#fffefa",
    },
    formButtonPrimary: {
      background: "#5b4699",
      borderRadius: "10px",
      boxShadow: "none",
      color: "#fffefa",
      fontWeight: "700",
    },
    formFieldInput: {
      border: "1px solid #e2dceb",
      borderRadius: "9px",
      color: "#40316f",
      background: "#fbf9fd",
    },
    footerAction: { background: "transparent" },
    dividerLine: { background: "#e2dceb" },
    alert: { borderRadius: "10px" },
    otpCodeFieldInput: { borderRadius: "8px", borderColor: "#e2dceb" },
    formFieldRow: { marginBottom: "14px" },
    main: { color: "#29243c" },
  },
};

function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-content">
        <a className="auth-back-link" href={basePath || "/"}>← Back to OpenWindow</a>
        <div className="auth-intro">
          <p>Keep your event window in sync.</p>
        </div>
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
        />
      </div>
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-content">
        <a className="auth-back-link" href={basePath || "/"}>← Back to OpenWindow</a>
        <div className="auth-intro">
          <p>Make room for something interesting.</p>
        </div>
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
        />
      </div>
    </main>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/workspace" /></Show>
      <Show when="signed-out"><OpenWindowWorkspace /></Show>
    </>
  );
}

function WorkspaceRoute() {
  return (
    <>
      <Show when="signed-in"><OpenWindowWorkspace /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to keep your saved events and preferences.",
          },
        },
        signUp: {
          start: {
            title: "Create your OpenWindow account",
            subtitle: "Save events and keep your calendar context in sync.",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/workspace" component={WorkspaceRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
      </Switch>
    </ClerkProvider>
  );
}

export default function AppRouter() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRoutes />
    </WouterRouter>
  );
}
