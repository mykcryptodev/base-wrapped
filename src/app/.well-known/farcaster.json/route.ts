export async function GET() {
  const appUrl = process.env.APP_URL;

  const config = {
    accountAssociation: {
      header:
        "eyJmaWQiOjIxNzI0OCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweGViYTc4NzE3YjZmMDU5Q0ZFMGI3NUU3NUMyZWQ0QkI3Y0E2NTE1NEYifQ",
      payload: "eyJkb21haW4iOiJiYXNld3JhcHBlZC5tZSJ9",
      signature:
        "MHhiODUzYzhkMjc0NzdlNmMxNWYyY2E5OTFhMTljYjI2YWI1YjFjODMzY2UxNmIyZjA5MWIzYzMwODBkMjk2ZjNhNWJmMzMxZGI2NjIzNTU0NGFiYWIyMTJhYWFiMDI3NGExZjMyYzQzMzk1NjdhYTExMGRmODc2ZGIyN2VhNTE0OTFj",
    },
    frame: {
      version: "0.0.0",
      name: "Base Wrapped",
      iconUrl: `${appUrl}/icon.png`,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: "#f7f7f7",
      homeUrl: appUrl,
      webhookUrl: `${appUrl}/api/webhook`,
    },
  };

  return Response.json(config);
}
