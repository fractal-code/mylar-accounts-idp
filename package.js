Package.describe({
    summary: "Login service for IDP accounts",
    name: "mylar:accounts-idp",
    version: "0.1.1",
    git: "https://github.com/gliesesoftware/mylar-accounts-idp.git"
});

Package.onUse(function (api) {
    api.versionsFrom('METEOR@1.0');

    api.use(['accounts-base', 'accounts-password', 'tracker', 'mongo', 'session', 'mylar:basic-crypto@0.1.0'], ['client', 'server']);
    api.use(['email', 'mylar:principal@0.2.0'], 'client');

    api.addFiles('accounts_common.js', ['client', 'server']);
    api.addFiles('idp_client.js', ['client', 'server']);
    api.addFiles('idp_token.js', 'client');
    api.addFiles('accounts_client.js', 'client');
    api.addFiles('accounts_server.js', 'server');

    // TODO: export just one variable
    api.export("idp_init");
    api.export("idp_verify_msg");
    api.export("idp_app_url");
});
