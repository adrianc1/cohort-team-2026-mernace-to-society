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
  additional_property_ids: [],
};

const inputClassName = "input";

function AdditionalProperties({
  properties,
  primaryPropertyId,
  selected,
  onChange,
  loading,
  error,
  onRetry,
  disabled,
}) {
  return (
    <fieldset>
      <legend className="label">Additional properties (optional)</legend>
      <p className="mb-2 text-xs text-gray-600">
        Bills will continue to use the primary property.
      </p>
      {properties.filter((property) => property.id !== primaryPropertyId).map((property) => (
        <label key={property.id} className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            disabled={disabled || loading || Boolean(error)}
            checked={selected.includes(property.id)}
            onChange={(event) =>
              onChange(event.target.checked
                ? [...selected, property.id]
                : selected.filter((id) => id !== property.id))
            }
          />
          {property.name}
        </label>
      ))}
      {loading && <p className="text-sm text-gray-600">Loading properties...</p>}
      {error && <p role="alert" className="text-sm text-red-700">Could not load properties: {error}</p>}
      {error && <button type="button" onClick={onRetry} disabled={disabled} className="link">Retry</button>}
    </fieldset>
  );
}

function VendorForm({
  isSubmitting = false,
  error = "",
  onCancel,
  onSubmit,
  onAccountSaved,
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
        additional_property_ids: [],
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
    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(name === "property_id"
        ? { additional_property_ids: current.additional_property_ids.filter((id) => id !== value) }
        : {}),
    }));
  }

  function startEditingAccount(account) {
    if (!account.id || !account.property_id || !Array.isArray(account.additional_property_ids)) {
      setAccountError("Account details are incomplete. Refresh the vendor list and try again.");
      return;
    }
    setEditingAccountId(account.id);
    setEditingAccountData({
      accountNumber: account.account_number ?? "",
      service: account.service ?? "",
      primaryPropertyId: account.property_id,
      additionalPropertyIds: account.additional_property_ids,
    });
    setAccountError("");
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
    if (propertiesLoading || propertiesError) {
      setAccountError("Load properties before saving the account.");
      return;
    }

    setSavingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "update-vendor-account",
        {
          method: "PUT",
          body: {
            accountId: editingAccountId,
            accountNumber: editingAccountData.accountNumber.trim(),
            service: editingAccountData.service.trim(),
            additionalPropertyIds: editingAccountData.additionalPropertyIds,
          },
        },
      );

      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || error.message || "Failed to save account.");
      }
      if (data?.error) throw new Error(data.error);
      try {
        await onAccountSaved();
      } catch {
        throw new Error("Account was saved, but the vendor list could not be refreshed.");
      }
      cancelEditingAccount();
    } catch (caughtError) {
      setAccountError(caughtError instanceof Error ? caughtError.message : "Failed to save account.");
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
        additional_property_ids: formData.additional_property_ids,
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
      vendorPayload.additional_property_ids = formData.additional_property_ids;
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
                  Primary property
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

              {formData.property_id && (
                <AdditionalProperties
                  properties={properties}
                  primaryPropertyId={formData.property_id}
                  selected={formData.additional_property_ids}
                  onChange={(ids) => setFormData((current) => ({ ...current, additional_property_ids: ids }))}
                  loading={propertiesLoading}
                  error={propertiesError}
                  onRetry={() => fetchProperties().catch(() => {})}
                  disabled={isSubmitting}
                />
              )}

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
                    <label htmlFor="edit-account-number" className="label">Account Number</label>
                    <input
                      id="edit-account-number"
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
                    <label htmlFor="edit-account-service" className="label">Service Type</label>
                    <input
                      id="edit-account-service"
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
                  <p className="text-sm">
                    Primary property: {properties.find((property) => property.id === editingAccountData.primaryPropertyId)?.name
                      || vendorData.vendor_account.find((account) => account.id === editingAccountId)?.property?.name
                      || "Unavailable"}
                  </p>
                  <AdditionalProperties
                    properties={properties}
                    primaryPropertyId={editingAccountData.primaryPropertyId}
                    selected={editingAccountData.additionalPropertyIds}
                    onChange={(ids) => setEditingAccountData((current) => ({ ...current, additionalPropertyIds: ids }))}
                    loading={propertiesLoading}
                    error={propertiesError}
                    onRetry={() => fetchProperties().catch(() => {})}
                    disabled={savingAccount}
                  />
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
                          {account.property?.name && (
                              <span> • Primary: {account.property.name}</span>
                          )}
                            {(account.additional_property_ids || []).map((id) => (
                              <span key={id}> • {properties.find((property) => property.id === id)?.name || "Property unavailable"}</span>
                            ))}
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

          {accountError && (
            <p role="alert" className="alert-error">{accountError}</p>
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
              disabled={isSubmitting || savingAccount}
              className="btn-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || savingAccount || Boolean(editingAccountId)}
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
