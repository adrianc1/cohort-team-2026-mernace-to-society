import { useEffect, useState } from "react";
import { useProperties } from "../hooks/useProperties";
import { supabase } from "../../utils/supabase";

const emptyVendor = {
  name: "",
  aliases: "",
  portal_url: "",
  email: "",
  phone_number: "",
  account_number: "",
  service: "",
  property_id: "",
};

const inputClassName = "input";

function VendorForm({
  isSubmitting = false,
  error = "",
  onCancel,
  onSubmit,
  editMode = false,
  addAccountMode = false,
  vendorData = null,
  // Starting values read from a bill: { name, account_number, portal_url, property_id }. Any can be missing.
  initialValues = null,
}) {
  // A form opened from a bill exists to create the account, so it isn't optional there
  const accountRequired = addAccountMode || Boolean(initialValues);

  const {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
    fetchProperties,
  } = useProperties();

  const [formData, setFormData] = useState(() => {
    if ((editMode || addAccountMode) && vendorData) {
      return {
        name: vendorData.name || "",
        aliases:
          addAccountMode && Array.isArray(vendorData.aliases)
            ? vendorData.aliases.join(", ")
            : vendorData.aliases || "",
        portal_url: vendorData.portal_url || "",
        email: vendorData.email || "",
        phone_number: vendorData.phone_number || "",
        account_number: initialValues?.account_number || "",
        service: "",
        property_id: initialValues?.property_id || "",
      };
    }
    return {
      ...emptyVendor,
      name: initialValues?.name || "",
      account_number: initialValues?.account_number || "",
      portal_url: initialValues?.portal_url || "",
      property_id: initialValues?.property_id || "",
    };
  });

  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingAccountData, setEditingAccountData] = useState(null);
  const [accountError, setAccountError] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    fetchProperties().catch(() => {});
  }, [fetchProperties]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function startEditingAccount(account) {
    try {
      console.log("Starting edit for account:", account);
      
      // Handle both old format (with property_id) and new format (with vendor_account_property)
      let selectedProperties = [];
      
      if (account.vendor_account_property && Array.isArray(account.vendor_account_property)) {
        // New format: has junction table data
        console.log("Using new format with vendor_account_property");
        selectedProperties = account.vendor_account_property
          .map((ap) => {
            if (ap.property && ap.property.id) {
              return ap.property.id;
            }
            console.warn("Missing property data in:", ap);
            return null;
          })
          .filter(Boolean);
      } else if (account.property_id) {
        // Old format: has single property_id
        console.log("Using old format with property_id:", account.property_id);
        selectedProperties = [account.property_id];
      }
      
      console.log("Selected properties:", selectedProperties);
      
      // Use account.id if available, otherwise use account_number as unique identifier
      const accountId = account.id || account.account_number;
      console.log("Account ID being used:", accountId);
      
      setEditingAccountId(accountId);
      setEditingAccountData({
        accountNumber: account.account_number,
        service: account.service,
        selectedProperties,
      });
      setAccountError("");
      console.log("Edit mode activated for account:", accountId);
    } catch (err) {
      console.error("Error starting account edit:", err);
      setAccountError("Failed to load account details: " + err.message);
    }
  }

  function cancelEditingAccount() {
    setEditingAccountId(null);
    setEditingAccountData(null);
    setAccountError("");
  }

  async function handleSaveAccount() {
    if (!editingAccountData.accountNumber.trim()) {
      setAccountError("Account number is required");
      return;
    }
    if (!editingAccountData.service.trim()) {
      setAccountError("Service type is required");
      return;
    }
    if (editingAccountData.selectedProperties.length === 0) {
      setAccountError("At least one property must be selected");
      return;
    }

    setSavingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "update-vendor-account",
        {
          body: {
            accountId: editingAccountId,
            accountNumber: editingAccountData.accountNumber.trim(),
            service: editingAccountData.service.trim(),
            propertyIds: editingAccountData.selectedProperties,
          },
        },
      );

      if (error || data?.error) {
        setAccountError(data?.error || error?.message || "Failed to save account");
        return;
      }

      cancelEditingAccount();
      // Trigger parent to refresh vendor data
      await onSubmit({
        name: formData.name.trim(),
        aliases: formData.aliases,
        portal_url: formData.portal_url.trim() || null,
        email: formData.email.trim() || null,
        phone_number: formData.phone_number.trim() || null,
        status: "active",
      });
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (addAccountMode) {
      await onSubmit({
        account_number: formData.account_number.trim(),
        service: formData.service.trim(),
        property_id: formData.property_id,
      });
      return;
    }

    const aliases = Array.isArray(formData.aliases)
      ? formData.aliases
      : (formData.aliases || "")
          .split(/[\n,]/)
          .map((alias) => alias.trim())
          .filter(Boolean);

    const vendorPayload = {
      name: formData.name.trim(),
      aliases,
      portal_url: formData.portal_url.trim() || null,
      email: formData.email.trim() || null,
      phone_number: formData.phone_number.trim() || null,
      status: "active",
    };

    if (!editMode) {
      vendorPayload.account_number = formData.account_number.trim() || null;
      vendorPayload.service = formData.service.trim() || null;
      vendorPayload.property_id = formData.property_id || null;
    }

    await onSubmit(vendorPayload);
  }

  return (
    <div className="modal-overlay">
      <div className="my-auto w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {addAccountMode
              ? "Add Vendor Account"
              : editMode
                ? "Update Vendor"
                : "Add Vendor"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-2xl leading-none text-gray-500 hover:text-black"
            aria-label="Close form"
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="vendor-name" className="label">
              Vendor Name
            </label>
            <input
              id="vendor-name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              readOnly={addAccountMode}
              className={`${inputClassName} ${addAccountMode ? "bg-gray-100" : ""}`}
              placeholder="Florida Power & Light"
              maxLength={100}
              required={!addAccountMode}
            />
          </div>

          <div>
            <label htmlFor="vendor-aliases" className="label">
              Aliases
            </label>
            <textarea
              id="vendor-aliases"
              name="aliases"
              value={formData.aliases}
              onChange={handleChange}
              readOnly={addAccountMode}
              className={`${inputClassName} ${addAccountMode ? "bg-gray-100" : ""}`}
              placeholder={"FPL\nFlorida Power"}
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-600">
              Optional. Separate alternate names with commas or new lines.
            </p>
          </div>

          <div>
            <label htmlFor="vendor-portal-url" className="label">
              Portal URL
            </label>
            <input
              id="vendor-portal-url"
              name="portal_url"
              type="url"
              value={formData.portal_url}
              onChange={handleChange}
              readOnly={addAccountMode}
              className={`${inputClassName} ${addAccountMode ? "bg-gray-100" : ""}`}
              placeholder="https://example.com"
              maxLength={2048}
            />
          </div>

          <div>
            <label htmlFor="vendor-email" className="label">
              Email
            </label>
            <input
              id="vendor-email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              readOnly={addAccountMode}
              className={`${inputClassName} ${addAccountMode ? "bg-gray-100" : ""}`}
              placeholder="billing@example.com"
            />
          </div>

          <div>
            <label htmlFor="vendor-phone" className="label">
              Phone Number
            </label>
            <input
              id="vendor-phone"
              name="phone_number"
              type="tel"
              value={formData.phone_number}
              onChange={handleChange}
              readOnly={addAccountMode}
              className={`${inputClassName} ${addAccountMode ? "bg-gray-100" : ""}`}
              placeholder="(555) 555-5555"
            />
          </div>

          {(!editMode || addAccountMode) && (
            <fieldset className="space-y-4 rounded-lg border border-secondary p-4">
              <legend className="px-1 text-sm font-semibold">
                Account Information{accountRequired ? "" : " (Optional)"}
              </legend>

              <div>
                <label htmlFor="vendor-account-number" className="label">
                  Account Number
                </label>
                <input
                  id="vendor-account-number"
                  name="account_number"
                  type="text"
                  value={formData.account_number}
                  onChange={handleChange}
                  className={inputClassName}
                  required={accountRequired}
                />
              </div>

              <div>
                <label htmlFor="vendor-service" className="label">
                  Service Type
                </label>
                <input
                  id="vendor-service"
                  name="service"
                  type="text"
                  value={formData.service}
                  onChange={handleChange}
                  className={inputClassName}
                  placeholder="Electric"
                  required={accountRequired}
                />
              </div>

              <div>
                <label htmlFor="vendor-property" className="label">
                  Property
                </label>
                <select
                  id="vendor-property"
                  name="property_id"
                  value={formData.property_id}
                  onChange={handleChange}
                  className={`${inputClassName} select max-w-full`}
                  disabled={propertiesLoading}
                  required={accountRequired}
                >
                  <option value="">
                    {propertiesLoading
                      ? "Loading properties..."
                      : accountRequired
                        ? "Select a property"
                        : "Select a property (optional)"}
                  </option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
                {propertiesError && (
                  <div className="mt-1 text-sm text-red-700">
                    <p role="alert">
                      Could not load properties: {propertiesError}
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchProperties().catch(() => {})}
                      className="link mt-1"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-600">
                {accountRequired
                  ? "Account number, service type, and property are required."
                  : "To create an account, provide the account number, service type, and property."}
              </p>
            </fieldset>
          )}

          {editMode && vendorData?.vendor_account && vendorData.vendor_account.length > 0 && (
            <div className="border-t border-secondary pt-4">
              <h3 className="mb-3 font-semibold">Vendor Accounts</h3>
              {editingAccountId && editingAccountData ? (
                <div className="space-y-3 rounded-lg bg-blue-50 p-4">
                  <div>
                    <label className="label">Account Number</label>
                    <input
                      type="text"
                      value={editingAccountData.accountNumber}
                      onChange={(e) =>
                        setEditingAccountData((curr) => ({
                          ...curr,
                          accountNumber: e.target.value,
                        }))
                      }
                      className={inputClassName}
                      disabled={savingAccount}
                    />
                  </div>
                  <div>
                    <label className="label">Service Type</label>
                    <input
                      type="text"
                      value={editingAccountData.service}
                      onChange={(e) =>
                        setEditingAccountData((curr) => ({
                          ...curr,
                          service: e.target.value,
                        }))
                      }
                      className={inputClassName}
                      disabled={savingAccount}
                    />
                  </div>
                  <div>
                    <label className="label">Properties</label>
                    <div className="space-y-2">
                      {properties.map((prop) => (
                        <label
                          key={prop.id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={editingAccountData.selectedProperties.includes(
                              prop.id,
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingAccountData((curr) => ({
                                  ...curr,
                                  selectedProperties: [
                                    ...curr.selectedProperties,
                                    prop.id,
                                  ],
                                }));
                              } else {
                                setEditingAccountData((curr) => ({
                                  ...curr,
                                  selectedProperties:
                                    curr.selectedProperties.filter(
                                      (id) => id !== prop.id,
                                    ),
                                }));
                              }
                            }}
                            disabled={savingAccount}
                            className="checkbox"
                          />
                          <span className="text-sm">{prop.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {accountError && (
                    <p className="text-xs text-red-700">{accountError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={cancelEditingAccount}
                      className="btn-secondary px-3 py-1 text-xs"
                      disabled={savingAccount}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAccount}
                      className="btn-primary px-3 py-1 text-xs"
                      disabled={savingAccount}
                    >
                      {savingAccount ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {vendorData.vendor_account.map((account) => (
                    <div
                      key={account.id || `${account.vendor_id}-${account.account_number}`}
                      className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{account.account_number}</p>
                        <p className="text-xs text-gray-600">
                          {account.service}
                          {account.vendor_account_property &&
                            account.vendor_account_property.length > 0 && (
                              <span>
                                {" "}
                                •{" "}
                                {account.vendor_account_property
                                  .map((ap) => ap.property.name)
                                  .join(", ")}
                              </span>
                            )}
                          {account.property?.name && (
                            <span> • {account.property.name}</span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditingAccount(account)}
                        className="link text-xs whitespace-nowrap ml-2"
                        disabled={isSubmitting}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="alert-error">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-secondary pt-5 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Saving..."
                : addAccountMode
                  ? "Add Account"
                  : editMode
                    ? "Update Vendor"
                    : "Create Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VendorForm;
