import {
  Alert,
  Button,
  Card,
  Checkbox,
  InputGroup,
  Intent,
  Label,
  NumericInput,
  Switch,
  Tab,
  Tabs,
} from "@blueprintjs/core";
import { TimePicker } from "@blueprintjs/datetime";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import {
  addOldRoamJSDependency,
  createBlock,
  createHTMLObserver,
  createPage,
  deleteBlock,
  getBasicTreeByParentUid,
  getFirstChildUidByBlockUid,
  getPageUidByPageTitle,
  getShallowTreeByParentUid,
  getTextByBlockUid,
  InputTextNode,
  localStorageGet,
  localStorageRemove,
  localStorageSet,
} from "roam-client";
import startOfDay from "date-fns/startOfDay";
import Description from "./Description";
import ExternalLogin, { ExternalLoginOptions } from "./ExternalLogin";
import { toTitle } from "./hooks";
import MenuItemSelect from "./MenuItemSelect";
import PageInput from "./PageInput";
import format from "date-fns/format";
import axios from "axios";
// import randomstring from "randomstring";
// import AES from "crypto-js/aes";
// import encutf8 from "crypto-js/enc-utf8";

type TextField = {
  type: "text";
  defaultValue?: string;
};

type TimeField = {
  type: "time";
  defaultValue?: Date;
};

type NumberField = {
  type: "number";
  defaultValue?: number;
};

type FlagField = {
  type: "flag";
  defaultValue?: boolean;
};

type MultiTextField = {
  type: "multitext";
  defaultValue?: string[];
};

type PagesField = {
  type: "pages";
  defaultValue?: string[];
};

type OauthField = {
  type: "oauth";
  defaultValue?: [];
  options: ExternalLoginOptions;
};

type SelectField = {
  type: "select";
  defaultValue?: string;
  options: {
    items: string[];
  };
};

type CustomField = {
  type: "custom";
  defaultValue?: InputTextNode[];
  options: {
    component: React.FC<{ parentUid: string; uid?: string }>;
  };
};

type ArrayField = PagesField | MultiTextField | CustomField;
type UnionField =
  | ArrayField
  | TextField
  | TimeField
  | NumberField
  | OauthField
  | FlagField
  | SelectField;

type Field<T extends UnionField> = T & {
  title: string;
  description: string;
};

type FieldPanel<T extends UnionField, U = Record<string, unknown>> = (
  props: {
    order: number;
    uid?: string;
    parentUid: string;
  } & Omit<Field<T>, "type"> &
    U
) => React.ReactElement;

const useSingleChildValue = <T extends string | number | Date>({
  defaultValue,
  uid: initialUid,
  title,
  parentUid,
  order,
  transform,
  toStr,
}: {
  title: string;
  parentUid: string;
  order: number;
  uid?: string;
  defaultValue: T;
  transform: (s: string) => T;
  toStr: (t: T) => string;
}): { value: T; onChange: (v: T) => void } => {
  const [uid, setUid] = useState(initialUid);
  const [valueUid, setValueUid] = useState(
    uid && getFirstChildUidByBlockUid(uid)
  );
  const [value, setValue] = useState(
    (valueUid && transform(getTextByBlockUid(valueUid))) || defaultValue
  );
  const onChange = useCallback(
    (v: T) => {
      setValue(v);
      if (valueUid) {
        window.roamAlphaAPI.updateBlock({
          block: { string: toStr(v), uid: valueUid },
        });
      } else if (uid) {
        const newValueUid = window.roamAlphaAPI.util.generateUID();
        window.roamAlphaAPI.createBlock({
          block: { string: toStr(v), uid: newValueUid },
          location: { order: 0, "parent-uid": uid },
        });
        setValueUid(newValueUid);
      } else {
        const newUid = window.roamAlphaAPI.util.generateUID();
        window.roamAlphaAPI.createBlock({
          block: { string: title, uid: newUid },
          location: { order, "parent-uid": parentUid },
        });
        setTimeout(() => setUid(newUid));
        const newValueUid = window.roamAlphaAPI.util.generateUID();
        window.roamAlphaAPI.createBlock({
          block: { string: toStr(v), uid: newValueUid },
          location: { order: 0, "parent-uid": newUid },
        });
        setValueUid(newValueUid);
      }
    },
    [setValue, setValueUid, title, parentUid, order, uid, valueUid, setUid]
  );
  return { value, onChange };
};

const MultiChildPanel: FieldPanel<
  ArrayField,
  {
    InputComponent: (props: {
      value: string;
      setValue: (s: string) => void;
    }) => React.ReactElement;
  }
> = ({
  uid: initialUid,
  title,
  description,
  order,
  parentUid,
  InputComponent,
}) => {
  const [uid, setUid] = useState(initialUid);
  const [texts, setTexts] = useState(() =>
    uid ? getShallowTreeByParentUid(uid) : []
  );
  const [value, setValue] = useState("");
  return (
    <>
      <Label>
        {title}
        <Description description={description} />
        <div style={{ display: "flex" }}>
          <InputComponent value={value} setValue={setValue} />
          <Button
            icon={"plus"}
            minimal
            disabled={!value}
            onClick={() => {
              const valueUid = window.roamAlphaAPI.util.generateUID();
              if (uid) {
                window.roamAlphaAPI.createBlock({
                  location: { "parent-uid": uid, order: texts.length },
                  block: { string: value, uid: valueUid },
                });
              } else {
                const newUid = window.roamAlphaAPI.util.generateUID();
                window.roamAlphaAPI.createBlock({
                  block: { string: title, uid: newUid },
                  location: { order, "parent-uid": parentUid },
                });
                setTimeout(() => setUid(newUid));
                window.roamAlphaAPI.createBlock({
                  block: { string: value, uid: valueUid },
                  location: { order: 0, "parent-uid": newUid },
                });
              }
              setTexts([...texts, { text: value, uid: valueUid }]);
              setValue("");
            }}
          />
        </div>
      </Label>
      {texts.map((p) => (
        <div
          key={p.uid}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {p.text}
          </span>
          <Button
            icon={"trash"}
            minimal
            onClick={() => {
              window.roamAlphaAPI.deleteBlock({ block: { uid: p.uid } });
              setTexts(texts.filter((f) => f.uid !== p.uid));
            }}
          />
        </div>
      ))}
    </>
  );
};

const TextPanel: FieldPanel<TextField> = ({
  title,
  uid,
  parentUid,
  order,
  description,
  defaultValue = "",
}) => {
  const { value, onChange } = useSingleChildValue({
    defaultValue,
    title,
    uid,
    parentUid,
    order,
    transform: (s) => s,
    toStr: (s) => s,
  });
  return (
    <Label>
      {title}
      <Description description={description} />
      <InputGroup
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
      />
    </Label>
  );
};

const TimePanel: FieldPanel<TimeField> = ({
  title,
  uid,
  parentUid,
  order,
  description,
  defaultValue = startOfDay(new Date()),
}) => {
  const { value, onChange } = useSingleChildValue({
    defaultValue,
    title,
    uid,
    parentUid,
    order,
    transform: (s) => {
      const d = new Date();
      const [hours, minutes] = s.split(":");
      d.setHours(Number(hours));
      d.setMinutes(Number(minutes));
      return d;
    },
    toStr: (v) => format(v, "HH:mm"),
  });
  return (
    <Label>
      {title}
      <Description description={description} />
      <TimePicker value={value} onChange={onChange} showArrowButtons />
    </Label>
  );
};

const NumberPanel: FieldPanel<NumberField> = ({
  title,
  uid,
  parentUid,
  order,
  description,
  defaultValue = 0,
}) => {
  const { value, onChange } = useSingleChildValue({
    defaultValue,
    title,
    uid,
    parentUid,
    order,
    transform: parseInt,
    toStr: (v) => `${v}`,
  });
  return (
    <Label>
      {title}
      <Description description={description} />
      <NumericInput value={value} onValueChange={onChange} />
    </Label>
  );
};

const SelectPanel: FieldPanel<SelectField> = ({
  title,
  uid,
  parentUid,
  order,
  description,
  defaultValue = "",
  options: { items },
}) => {
  const { value, onChange } = useSingleChildValue({
    defaultValue: defaultValue || items[0],
    title,
    uid,
    parentUid,
    order,
    transform: (s) => s,
    toStr: (s) => s,
  });
  return (
    <Label>
      {title}
      <Description description={description} />
      <MenuItemSelect
        activeItem={value}
        onItemSelect={(e) => onChange(e)}
        items={items}
      />
    </Label>
  );
};

const FlagPanel: FieldPanel<FlagField> = ({
  title,
  uid: initialUid,
  parentUid,
  order,
  description,
}) => {
  const [uid, setUid] = useState(initialUid);
  return (
    <Checkbox
      checked={!!uid}
      onChange={(e) => {
        if ((e.target as HTMLInputElement).checked) {
          const newUid = window.roamAlphaAPI.util.generateUID();
          window.roamAlphaAPI.createBlock({
            block: { string: title, uid: newUid },
            location: { order, "parent-uid": parentUid },
          });
          setTimeout(() => setUid(newUid), 1);
        } else {
          window.roamAlphaAPI.deleteBlock({ block: { uid } });
          setUid("");
        }
      }}
      labelElement={
        <>
          {title}
          <Description description={description} />
        </>
      }
    />
  );
};

const MultiTextPanel: FieldPanel<MultiTextField> = (props) => {
  return (
    <MultiChildPanel
      {...props}
      InputComponent={({ value, setValue }) => (
        <InputGroup value={value} onChange={(e) => setValue(e.target.value)} />
      )}
    />
  );
};

const PagesPanel: FieldPanel<PagesField> = (props) => {
  return (
    <MultiChildPanel
      {...props}
      InputComponent={(inputProps) => (
        <PageInput extra={["{all}"]} {...inputProps} />
      )}
    />
  );
};

const OauthPanel: FieldPanel<OauthField> = ({
  uid,
  parentUid,
  description,
  options,
}) => {
  const key = `oauth-${options.service}`;
  const [useLocal, setUseLocal] = useState(!!localStorageGet(key));
  const [accounts, setAccounts] = useState<
    { text: string; uid: string; data: string }[]
  >(() =>
    useLocal
      ? JSON.parse(localStorageGet(key) as string)
      : uid
      ? getBasicTreeByParentUid(uid).map((v) => ({
          text: v.children[0]?.text ? v.text : "Default Account",
          uid: v.uid,
          data: v.children[0]?.text || v.text,
        }))
      : []
  );
  const onCheck = useCallback(
    (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      setUseLocal(checked);
      if (checked) {
        if (uid) {
          getShallowTreeByParentUid(uid).forEach(({ uid: u }) =>
            deleteBlock(u)
          );
        }
        localStorageSet(key, JSON.stringify(accounts));
      } else {
        localStorageRemove(key);
        if (uid) {
          accounts.forEach(({ text, uid: u, data }, order) => {
            window.roamAlphaAPI.createBlock({
              location: { "parent-uid": uid, order },
              block: { string: text, uid: u },
            });
            window.roamAlphaAPI.createBlock({
              location: { "parent-uid": u, order: 0 },
              block: { string: data },
            });
          });
        }
      }
    },
    [setUseLocal, accounts, uid, key]
  );
  return (
    <>
      <Checkbox
        labelElement={
          <>
            Store Locally
            <Description
              description={
                "If checked, sensitive authentication data will be stored locally on your machine and will require re-logging in per device. If unchecked, sensitive authentication data will be stored in your Roam Graph."
              }
            />
          </>
        }
        checked={useLocal}
        onChange={onCheck}
      />
      <Label>
        Log In
        <Description description={description} />
      </Label>
      <ExternalLogin
        useLocal={useLocal}
        onSuccess={(acc) => setAccounts([...accounts, acc])}
        parentUid={parentUid}
        {...options}
      />
      <ul style={{ marginTop: 8, padding: 0 }}>
        {accounts.map((act) => (
          <li
            key={act.uid}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <span style={{ minWidth: 192 }}>{act.text}</span>
            <Button
              text={"Log Out"}
              onClick={() => {
                if (useLocal) {
                  const accts = JSON.parse(localStorageGet(key) as string) as {
                    uid: string;
                  }[];
                  localStorageSet(
                    key,
                    JSON.stringify(accts.filter((a) => act.uid !== a.uid))
                  );
                } else {
                  deleteBlock(act.uid);
                }
                setAccounts(accounts.filter((a) => act.uid !== a.uid));
              }}
            />
          </li>
        ))}
      </ul>
    </>
  );
};

const CustomPanel: FieldPanel<CustomField> = ({
  description,
  title,
  uid,
  options: { component: Component },
  parentUid,
}) => (
  <>
    <Label>
      {title}
      <Description description={description} />
    </Label>
    <Component uid={uid} parentUid={parentUid} />
  </>
);

const ToggleablePanel = ({
  enabled,
  setEnabled,
  pageUid,
  order,
  id,
  extensionId,
  setUid,
  uid,
  toggleable,
}: {
  uid: string;
  id: string;
  extensionId: string;
  pageUid: string;
  order: number;
  enabled: boolean;
  toggleable: Exclude<Required<ConfigTab["toggleable"]>, false | undefined>;
  setEnabled: (b: boolean) => void;
  setUid: (s: string) => void;
}) => {
  const isPremium = useMemo(() => toggleable !== true, [toggleable]);
  const [price, setPrice] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const enableCallback = (checked: boolean) => {
    setEnabled(checked);
    if (checked) {
      const newUid = window.roamAlphaAPI.util.generateUID();
      window.roamAlphaAPI.createBlock({
        location: { "parent-uid": pageUid, order },
        block: { string: id, uid: newUid },
      });
      setTimeout(() => setUid(newUid));
    } else {
      window.roamAlphaAPI.deleteBlock({ block: { uid } });
      setUid("");
    }
  };
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (isPremium) {
      const priceId = (toggleable as Exclude<typeof toggleable, true>).replace(
        /^dev_/,
        ""
      );
      const dev = priceId === toggleable ? "" : "&dev=true";
      axios
        .get(`https://lambda.roamjs.com/price?id=${priceId}${dev}`)
        .then((r) => setPrice(r.data.price))
        .catch((e) =>
          setError(e.response?.data?.message || e.response?.data || e.message)
        );
    }
  }, [isPremium, toggleable, setError]);
  return (
    <>
      <Switch
        labelElement={"Enabled"}
        checked={enabled}
        disabled={price === 0}
        onChange={(e) =>
          isPremium
            ? setIsOpen(true)
            : enableCallback((e.target as HTMLInputElement).checked)
        }
      />
      <p>
        {isPremium &&
          `This is a premium extension. Enabling certain features will require a paid subscription.`}
      </p>
      <p style={{ color: "red" }}>{error}</p>
      <Alert
        isOpen={isOpen}
        onConfirm={() => {
          setLoading(true);
          // const otp = randomstring.generate(8);
          // const key = randomstring.generate(16);
          // const state = `roamjs_${otp}_${key}`;
          const width = 600;
          const height = 525;
          const left = window.screenX + (window.innerWidth - width) / 2;
          const top = window.screenY + (window.innerHeight - height) / 2;
          window.open(
            `https://roamjs.com/login?service=${extensionId}`,
            `roamjs:roamjs:login`,
            `left=${left},top=${top},width=${width},height=${height},status=1`
          );
          /*let intervalListener = 0;
          const authInterval = () => {
            axios
              .post(`https://lambda.roamjs.com/auth`, {
                service: "roamjs",
                otp,
              })
              .then((r) => {
                if (r.data.auth) {
                  const auth = AES.decrypt(r.data.auth, key).toString(encutf8);
                  enableCallback(!enabled);
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
          authInterval();*/
        }}
        confirmButtonText={"Submit"}
        cancelButtonText={"Cancel"}
        intent={Intent.PRIMARY}
        loading={loading}
        onCancel={() => setIsOpen(false)}
      >
        {enabled
          ? `By clicking submit below, you will unsubscribe from the premium features of the RoamJS Extension: ${toTitle(
              extensionId
            )}`
          : `By clicking submit below, you will subscribe to the premium features of the RoamJS Extension: ${toTitle(
              extensionId
            )} for $${price}/month. A window will first appear to log in to your RoamJS account.`}
      </Alert>
    </>
  );
};

const Panels = {
  text: TextPanel,
  time: TimePanel,
  number: NumberPanel,
  flag: FlagPanel,
  pages: PagesPanel,
  oauth: OauthPanel,
  multitext: MultiTextPanel,
  select: SelectPanel,
  custom: CustomPanel,
} as { [UField in UnionField as UField["type"]]: FieldPanel<UField> };

type ConfigTab = {
  id: string;
  toggleable?: boolean | `price_${string}` | `dev_price_${string}`;
  fields: Field<UnionField>[];
};

type Config = {
  tabs: ConfigTab[];
  versioning?: boolean;
};

const FieldTabs = ({
  id,
  fields,
  uid: initialUid,
  pageUid,
  order,
  toggleable,
  extensionId,
}: {
  uid: string;
  pageUid: string;
  order: number;
  extensionId: string;
} & ConfigTab) => {
  const [uid, setUid] = useState(initialUid);
  const parentUid = useMemo(
    () =>
      /home/i.test(id)
        ? pageUid
        : uid ||
          (toggleable
            ? ""
            : createBlock({
                parentUid: pageUid,
                order,
                node: { text: id },
              })),
    [pageUid, uid, id, toggleable]
  );
  const childUids = Object.fromEntries(
    getShallowTreeByParentUid(parentUid).map(({ text, uid }) => [
      text.toLowerCase().trim(),
      uid,
    ])
  );
  const [enabled, setEnabled] = useState(!toggleable || !!parentUid);
  const [selectedTabId, setSelectedTabId] = useState(
    enabled && fields.length ? fields[0].title : "enabled"
  );
  const onTabsChange = useCallback(
    (tabId: string) => setSelectedTabId(tabId),
    [setSelectedTabId]
  );
  return (
    <Tabs
      vertical
      id={`${id}-field-tabs`}
      onChange={onTabsChange}
      selectedTabId={selectedTabId}
      renderActiveTabPanelOnly
    >
      {toggleable && (
        <Tab
          id={"enabled"}
          title={"enabled"}
          panel={
            selectedTabId === "enabled" ? (
              <ToggleablePanel
                id={id}
                uid={uid}
                pageUid={pageUid}
                extensionId={extensionId}
                enabled={enabled}
                order={order}
                toggleable={toggleable}
                setUid={setUid}
                setEnabled={setEnabled}
              />
            ) : undefined
          }
        />
      )}
      {fields.map((field, i) => {
        const { type, title, defaultValue } = field;
        const Panel = Panels[type];
        return (
          <Tab
            id={title}
            key={title}
            title={title}
            disabled={!enabled}
            panel={
              selectedTabId === title ? (
                <Panel
                  {...field}
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore 4.3.0
                  defaultValue={defaultValue}
                  order={i}
                  parentUid={parentUid}
                  uid={childUids[title.toLowerCase()]}
                />
              ) : undefined
            }
          />
        );
      })}
    </Tabs>
  );
};

const ConfigPage = ({
  id,
  config,
  pageUid,
}: {
  id: string;
  config: Config;
  pageUid: string;
}): React.ReactElement => {
  const userTabs = config.tabs.filter((t) => t.fields.length || t.toggleable);
  const [selectedTabId, setSelectedTabId] = useState(userTabs[0]?.id);
  const onTabsChange = useCallback(
    (tabId: string) => setSelectedTabId(tabId),
    [setSelectedTabId]
  );
  const tree = getBasicTreeByParentUid(pageUid);
  const [currentVersion, setCurrentVersion] = useState("");
  useEffect(() => {
    if (config.versioning) {
      addOldRoamJSDependency("versioning");
      const scriptVersionMatch = window.roamjs?.version?.[id];
      if (scriptVersionMatch) {
        setCurrentVersion(scriptVersionMatch);
      } else {
        setCurrentVersion("Version Not Found");
      }
    }
  }, [config.versioning, id, setCurrentVersion]);
  return (
    <Card style={{ color: "#202B33" }} className={"roamjs-config-panel"}>
      <style>
        {`.roamjs-config-panel .bp3-tab-panel {
  width: 100%;
}`}
      </style>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h4 style={{ padding: 4 }}>{toTitle(id)} Configuration</h4>
        {currentVersion && (
          <span>
            <span style={{ color: "#cccccc", fontSize: 8 }}>
              v{currentVersion}
            </span>
            <Button
              icon={"git-branch"}
              minimal
              onClick={() =>
                window.roamjs?.extension.versioning.switch({
                  id,
                  currentVersion,
                })
              }
              style={{ marginLeft: 4 }}
            />
          </span>
        )}
      </div>
      <Tabs
        vertical
        id={`${id}-config-tabs`}
        onChange={onTabsChange}
        selectedTabId={selectedTabId}
      >
        {userTabs.map(({ id: tabId, fields, toggleable }, i) => (
          <Tab
            id={tabId}
            key={tabId}
            title={tabId}
            panel={
              tabId === selectedTabId ? (
                <FieldTabs
                  id={tabId}
                  extensionId={id}
                  fields={fields}
                  uid={
                    tree.find((t) => new RegExp(tabId, "i").test(t.text))
                      ?.uid || ""
                  }
                  pageUid={pageUid}
                  order={i}
                  toggleable={toggleable}
                />
              ) : undefined
            }
          />
        ))}
      </Tabs>
    </Card>
  );
};

const fieldsToChildren = (t: ConfigTab) =>
  t.fields
    .filter((f) => !!f.defaultValue)
    .map((f) => ({
      text: f.title,
      children:
        f.type === "flag"
          ? []
          : f.type === "custom"
          ? f.defaultValue || []
          : f.type === "pages" || f.type === "multitext"
          ? f.defaultValue?.map((v) => ({ text: v }))
          : [{ text: `${f.defaultValue}` }],
    }));

const createConfigPage = ({
  title,
  config,
}: {
  title: string;
  config: Config;
}) => {
  const homeTab = config.tabs.find((t) => /home/i.test(t.id)) as ConfigTab;
  const rawTree = [
    ...(homeTab ? fieldsToChildren(homeTab) : []),
    ...config.tabs
      .filter((t) => !/home/i.test(t.id) && !t.toggleable)
      .map((t) => ({
        text: t.id,
        children: fieldsToChildren(t),
      })),
  ];
  return createPage({
    title,
    tree: rawTree.length ? rawTree : [{ text: " " }],
  });
};

export const createConfigObserver = ({
  title,
  config,
}: {
  title: string;
  config: Config;
}): { pageUid: string } => {
  const pageUid =
    getPageUidByPageTitle(title) ||
    createConfigPage({
      title,
      config,
    });
  if (config.tabs.length) {
    createHTMLObserver({
      className: "rm-title-display",
      tag: "H1",
      callback: (d: HTMLElement) => {
        const h = d as HTMLHeadingElement;
        if (h.innerText === title) {
          const uid = getPageUidByPageTitle(title);
          const attribute = `data-roamjs-${uid}`;
          const containerParent = h.parentElement?.parentElement;
          if (containerParent && !containerParent.hasAttribute(attribute)) {
            containerParent.setAttribute(attribute, "true");
            const parent = document.createElement("div");
            parent.id = `${title.replace("roam/js/", "roamjs-")}-config`;
            containerParent.insertBefore(
              parent,
              d.parentElement?.nextElementSibling || null
            );
            ReactDOM.render(
              <ConfigPage
                id={title.replace("roam/js/", "")}
                config={config}
                pageUid={pageUid}
              />,
              parent
            );
          }
        }
      },
    });
  }
  return {
    pageUid,
  };
};

export default ConfigPage;
