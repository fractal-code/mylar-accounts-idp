var current_pw = null;

function check_is_email(email) {

    return email && email.indexOf('@') != -1;
}

function create_user_princ(uname) {
    var u = Meteor.user();
    if (u && u._wrap_privkey && current_pw) {
        var keys = sjcl.decrypt(current_pw, u._wrap_privkey);
        Principal.set_current_user_keys(keys, uname);
    }
}


var createPrincipalCB = function (uprinc, cb) {
    cb();
};
Meteor.onCreatePrincipal = function (f) {
    createPrincipalCB = f;
};

var createUserOrig = Accounts.createUser;


/**
 * This method allows to attach the mylar key structure to an existing user,
 * eg. from a social-service-signup. Needs to be manually called with a
 * password to encrypt the users keys with
 * @param password
 * @param callback
 */
Accounts.attachMylarKeysToExistingUser = function (password, callback) {
    check(password, String);

    var usr = Meteor.user();
    if (!usr) throw new Error('User needs to be logged in to receive crypto keys');

    if (usr && usr._princ_name && usr._pk && usr._wrap_privkey) {
        console.log('wont give user new keys, already has');
        var keys = sjcl.decrypt(password, usr._wrap_privkey);
        Principal.set_current_user_keys(keys, usr._id);
        return (callback) && callback();
    }

    Principal.create('user', usr._id, null, function (uprinc) {
        var ukeys = serialize_keys(uprinc.keys);

        Principal.set_current_user_keys(ukeys, usr._id);
        Meteor.users.update(usr._id, {$set: {
                _princ_name: usr._id,
                _pk: serialize_public(uprinc.keys),
                _wrap_privkey: sjcl.encrypt(password, ukeys)
            }},
            function () {
                if (callback) callback();
            });
    });
};

Accounts.createUser = function (options, callback) {

    if (!options.email) {
        throw new Error("need to specify user email for accounts-idp2");
    }

    var uname = options.email || options.username;

    if (!options.password) {
        throw new Error("need to specify password");
    }

    var password = options.password;
    current_pw = password;

    Principal.create('user', uname, null, function (uprinc) {
        createPrincipalCB(uprinc, function () {
            var ukeys = serialize_keys(uprinc.keys);

            if (!options.suppressLogin)
                Principal.set_current_user_keys(ukeys, uname);

            options = _.clone(options);
            options._princ_name = uname;
            options.wrap_privkeys = sjcl.encrypt(password, ukeys);
            options.public_keys = serialize_public(uprinc.keys);

            createUserOrig(options, function (err) {
                callback(err, uprinc);
            });

        });
    });
};

// calls cb with error or undefined, if no error
Accounts.setUserPassword = function (email, password, cb) {
    if (!email)
        throw new Error("need username to set password");
    if (!password)
        throw new Error("need nonempty password");

    var verifier = SRP.generateVerifier(password);
    Principal.rewrappedKey(email, password, function (wrap) {
        Meteor.call("setSRP", email, verifier, wrap, function (error) {
            cb && cb(error);
        });
    });

};


Accounts.createUserWithToken = function (email, profile, callback) {
    if (!check_is_email(email)) {
        throw new Error("New user account must have email specified");
    }

    Meteor.call("createOtherUser", email, profile, callback);
};


function user_exists(email, cb) {
    Meteor.call("userExists", email, function (error, res) {
        if (error)
            throw new Error("issue with userExists " + error);
        cb && cb(res);
    });
}

var loginWithPasswordOrig = Meteor.loginWithPassword;

/* Creates an account for a user providing a token.
 Otherwise, it logs-in an existing user.
 selector must be either an email address
 or an object with an email field.*/
Meteor.loginWithPassword = function (selector, password, cb) {
    current_pw = password;

    if (!selector) {
        throw new Error("must specify selector");
    }

    var email;

    if (typeof selector == "string")
        email = selector;
    else {
        // must be object

        if (typeof selector == "object" && !selector.email) {
            console.log("selector is " + JSON.stringify(selector));
            throw new Error("must specify email");
        }
        email = selector.email;
    }


    // prepare callback: when done with login, set user principal
    // before calling user callback
    callback = function (err) {
        create_user_princ(email);
        cb && cb(err);
    }

    var account_token = Session.get("account_token");
    Session.set("tmp_account_token", null);

    if (account_token) {

        // check if user already has account
        user_exists(email, function (exists) {
            if (exists) {
                // user already has account and is just logging in normally
                loginWithPasswordOrig(selector, password, callback);
                return;
            } else {
                console.log("check token and create account");
                // check token to server
                Meteor.call("checkToken", account_token, email, function (err, profile) {
                    if (err)
                        throw new Error("token did not check: " + err);

                    var options = {email: email, username: email, password: password};

                    console.log("check token returns profile " + JSON.stringify(profile));
                    if (profile)
                        options.profile = profile;

                    Accounts.createUser(options, function (error) {
                        console.log("got error " + error);
                        callback && callback(error);
                    });
                });
                return;
            }
        });
    } else {
        // no account token -- user must exist

        loginWithPasswordOrig(selector, password, callback);
    }

};


var logoutOrig = Meteor.logout;

Meteor.logout = function (cb) {
    Principal.delete_current_user_keys();
    logoutOrig(cb);
}
