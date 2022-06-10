import { Button, Icon, Spinner } from "@blueprintjs/core";
import React, { useState, useCallback } from "react";
import createBlock from "../writes/createBlock";
import getBasicTreeByParentUid from "../queries/getBasicTreeByParentUid";
import idToTitle from "../util/idToTitle";
import nanoid from "nanoid";
import AES from "crypto-js/aes";
import encutf8 from "crypto-js/enc-utf8";
import localStorageGet from "../util/localStorageGet";
import localStorageSet from "../util/localStorageSet";
import apiPost from "../util/apiPost";

export type ExternalLoginOptions = {
  service: string;
  getPopoutUrl: (state: string) => Promise<string>;
  getAuthData: (d: string) => Promise<Record<string, string>>;
  ServiceIcon: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
};

const targetOrigin = process.env.CUSTOM_ROAMJS_ORIGIN || "https://roamjs.com";

const ExternalLogin = ({
  onSuccess,
  useLocal,
  parentUid,
  service,
  getPopoutUrl,
  getAuthData,
  ServiceIcon,
  loggedIn = false,
}: {
  onSuccess: (block: { text: string; uid: string; data: string }) => void;
  parentUid: string;
  useLocal?: boolean;
  loggedIn?: boolean;
} & ExternalLoginOptions): React.ReactElement => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onClick = useCallback(() => {
    const otp = nanoid().replace(/_/g, "-");
    const key = nanoid().replace(/_/g, "-");
    const state = `${service}_${otp}_${key}`;
    setLoading(true);
    getPopoutUrl(state)
      .then((url) => {
        const width = 600;
        const height = 525;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;
        const loginWindow = window.open(
          `${url}&state=${state}`,
          `roamjs:${service}:login`,
          `left=${left},top=${top},width=${width},height=${height},status=1`
        );
        let intervalListener = 0;
        const processAuthData = (data: string) => {
          loginWindow?.close?.();
          getAuthData(data)
            .then(async (rr) => {
              const labelUid = window.roamAlphaAPI.util.generateUID();
              const { label = "Default Account", ...rawData } = rr;
              const oauthData = JSON.stringify(rawData);
              const account = {
                text: label,
                uid: labelUid,
                data: oauthData,
                time: new Date().valueOf(),
              };

              const existingTree = getBasicTreeByParentUid(parentUid).find(
                (t) => /oauth/i.test(t.text)
              );
              const blockUid =
                existingTree?.uid ||
                (await createBlock({ node: { text: "oauth" }, parentUid }));
              if (useLocal) {
                const key = `oauth-${service}`;
                const accounts = JSON.parse(localStorageGet(key) as string);
                localStorageSet(key, JSON.stringify([...accounts, account]));
              } else {
                window.roamAlphaAPI.createBlock({
                  block: { string: label, uid: labelUid },
                  location: {
                    "parent-uid": blockUid,
                    order: existingTree?.children?.length || 0,
                  },
                });

                const valueUid = window.roamAlphaAPI.util.generateUID();
                const block = {
                  string: oauthData,
                  uid: valueUid,
                };
                window.roamAlphaAPI.createBlock({
                  location: { "parent-uid": labelUid, order: 0 },
                  block,
                });
                window.roamAlphaAPI.updateBlock({
                  block: { open: false, string: "oauth", uid: blockUid },
                });
              }
              onSuccess(account);
            })
            .finally(() => {
              window.removeEventListener("message", messageEventListener);
              window.clearTimeout(intervalListener);
              setLoading(false);
            });
        };
        const messageEventListener = (e: MessageEvent) => {
          if (e.origin === targetOrigin && loginWindow) {
            processAuthData(e.data);
          }
        };
        const authInterval = () => {
          apiPost<{auth: string}>(
            `auth`,
            {
              service,
              otp,
            },
            { anonymous: true }
          )
            .then((r) => {
              if (r.auth) {
                const auth = AES.decrypt(r.auth, key).toString(encutf8);
                processAuthData(auth);
              } else {
                intervalListener = window.setTimeout(authInterval, 1000);
              }
            })
            .catch((e) => {
              if (e.response?.status !== 400) {
                intervalListener = window.setTimeout(authInterval, 1000);
              }
            });
        };
        authInterval();
        window.addEventListener("message", messageEventListener);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [onSuccess, parentUid, setLoading, setError]);
  return (
    <div style={{ display: "flex" }}>
      <Button
        icon={
          <Icon
            icon={
              <ServiceIcon
                style={{
                  width: 15,
                  height: 15,
                  marginLeft: 4,
                  cursor: "pointer",
                }}
              />
            }
          />
        }
        onClick={onClick}
        disabled={loading}
        className={"roamjs-external-login"}
      >
        {loggedIn
          ? `Add Another ${idToTitle(service)} Account`
          : `Login With ${idToTitle(service)}`}
      </Button>
      {loading && <Spinner size={Spinner.SIZE_SMALL} />}
      {error && (
        <div style={{ color: "red", whiteSpace: "pre-line" }}>{error}</div>
      )}
    </div>
  );
};

export default ExternalLogin;
