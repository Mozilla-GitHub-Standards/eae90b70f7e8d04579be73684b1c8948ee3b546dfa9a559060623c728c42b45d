var amoFeatured;
var amoFavorites;

async function restorePersona() {
    let storageResult = await browser.storage.local.get("currentPersona");

    if (storageResult && storageResult.currentPersona) {
        browser.theme.update(storageResult.currentPersona);
    }
}

restorePersona();

browser.management.onEnabled.addListener((addon) => {
    if (addon.type === "theme") {
        browser.storage.local.remove("currentPersona");
    }
});

browser.runtime.onMessage.addListener(async (message) => {
    switch (message.action) {
        case "getFavorites":
            browser.runtime.sendMessage({"favorites": await getAMOFavorites()});
            break;
        case "getFeatured":
            let feat = await getAMOFeatured();
            browser.runtime.sendMessage({"featured": feat});
            break;
        case "openAMOAndMonitor":
            let tab = await browser.tabs.create({
                url: "https://addons.mozilla.org/firefox/users/login"
            });
            browser.cookies.onChanged.addListener((changeInfo) => {
                //browser.cookies.onChanged.removeListener(listener);
                if (changeInfo.cookie.domain === "addons.mozilla.org" && changeInfo.cookie.name === "api_auth_token" && !changeInfo.removed && changeInfo.cause === "explicit") {
                    browser.tabs.remove(tab.id);
                }
            });
            break;
    }
});

async function getAMOCookie() {
    let amoCookie = await browser.cookies.get({
        url: "https://addons.mozilla.org",
        name: "api_auth_token"
    });
    return amoCookie;
}

async function makeAMORequest(url, auth) {
    let options = {};
    if (auth) {
        let cookie = await getAMOCookie();
        if (!cookie) {
            throw "NotLoggedIn";
        }
        let headers = new Headers();
        headers.set("Authorization", "Bearer " + cookie.value.replace(/"/g, ""));
        options.headers = headers;
    }

    let response = await fetch(url, options);
    let obj = await response.json();
    return obj;
}

async function makeAMORequestPaginated(url, auth, results = []) {
    let result = await makeAMORequest(url, auth);
    results.push(...result.results);
    if (result.next) {
        await makeAMORequestPaginated(result.next, auth, results);
    }
    return results;
}

async function getAMOFeatured() {
    if (!amoFeatured) {
        amoFeatured = await makeAMORequestPaginated("https://addons.mozilla.org/api/v3/accounts/account/mozilla/collections/featured-personas/addons/?sort=added");
    }
    return amoFeatured;
}

async function getAMOFavorites() {
    if (!amoFavorites) {
        let profile;
        try {
            profile = await makeAMORequest("https://addons.mozilla.org/api/v3/accounts/profile/", true);
        } catch (error) {
            if (error === "NotLoggedIn") {
                browser.runtime.sendMessage({"favorites": {"error": error}});
            }
        }
        if (profile) {
            amoFavorites = await makeAMORequestPaginated(`https://addons.mozilla.org/api/v3/accounts/account/${profile.username}/collections/favorites/addons/`, true);
        }
    }
    return amoFavorites;
}
