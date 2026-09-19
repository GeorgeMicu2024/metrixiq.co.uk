import {
  isUsablePersonName,
  isValidTrid,
  nameSignature,
  normalizeName,
  normalizeTrid,
  resolveIdentity,
} from "../identity.js";

export async function loadIdentityState(supabase, organizationId) {
  const [driversResult, aliasesResult] = await Promise.all([
    supabase
      .from("drivers")
      .select("id,organization_id,trid,full_name,site,status")
      .eq("organization_id", organizationId),
    supabase
      .from("driver_aliases")
      .select("id,driver_id,alias_type,alias_value,alias_normalized,confidence,source")
      .eq("organization_id", organizationId),
  ]);

  if (driversResult.error) throw driversResult.error;
  if (aliasesResult.error) throw aliasesResult.error;

  return {
    drivers: driversResult.data || [],
    aliases: aliasesResult.data || [],
  };
}

export async function persistMentorHashAliases(
  supabase,
  organizationId,
  mentorAliases = [],
  indexes
) {
  if (!mentorAliases?.length) return 0;

  const rowsByKey = new Map();

  for (const alias of mentorAliases) {
    const key = String(alias?.key || "").trim();
    if (!key) continue;

    let resolved = null;

    if (isValidTrid(alias.trid)) {
      resolved = resolveIdentity({ trid: alias.trid }, indexes);
    }

    if (!resolved?.driver && isUsablePersonName(alias.name)) {
      resolved = resolveIdentity({ name: alias.name }, indexes);
    }

    if (!resolved?.driver) continue;

    rowsByKey.set(key, {
      organization_id: organizationId,
      driver_id: resolved.driver.id,
      alias_type: "mentor_hash",
      alias_value: key,
      alias_normalized: key,
      confidence: Math.max(
        0.9,
        Number(
          alias.matchConfidence ||
            alias.confidence ||
            resolved.confidence ||
            0.9
        )
      ),
      source: alias.source || "eMentor alias master",
    });
  }

  const rows = [...rowsByKey.values()];
  if (!rows.length) return 0;

  const { data, error } = await supabase
    .from("driver_aliases")
    .upsert(rows, {
      onConflict: "organization_id,alias_type,alias_normalized",
    })
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export async function saveResolvedMentorHash(
  supabase,
  organizationId,
  driverId,
  driver
) {
  const key = String(
    driver?.mentorHash || driver?.details?.mentor?.identityKey || ""
  ).trim();

  if (!key || !driverId) return;

  const { error } = await supabase
    .from("driver_aliases")
    .upsert(
      {
        organization_id: organizationId,
        driver_id: driverId,
        alias_type: "mentor_hash",
        alias_value: key,
        alias_normalized: key,
        confidence: 1,
        source: driver.sources?.[0] || "Mentor performance report",
      },
      {
        onConflict: "organization_id,alias_type,alias_normalized",
      }
    );

  if (error) throw error;
}

export async function persistResolvedNameAliases(
  supabase,
  {
    organizationId,
    driverId,
    name,
    confidence,
    source,
  }
) {
  if (!driverId || !isUsablePersonName(name)) return;

  const aliases = [
    {
      organization_id: organizationId,
      driver_id: driverId,
      alias_type: "name",
      alias_value: name,
      alias_normalized: normalizeName(name),
      confidence,
      source: source || "resolved import",
    },
    {
      organization_id: organizationId,
      driver_id: driverId,
      alias_type: "mentor_name",
      alias_value: name,
      alias_normalized: nameSignature(name),
      confidence,
      source: source || "resolved import",
    },
  ];

  const { error } = await supabase
    .from("driver_aliases")
    .upsert(aliases, {
      onConflict: "organization_id,alias_type,alias_normalized",
    });

  if (error) throw error;
}

export async function seedIdentityRecords(
  supabase,
  organizationId,
  identityRecords = [],
  sourceRecords = []
) {
  const candidates = new Map();

  for (const identity of identityRecords) {
    const trid = normalizeTrid(identity.trid);
    if (!isValidTrid(trid) || !isUsablePersonName(identity.name)) continue;

    const previous = candidates.get(trid);

    if (!previous || (identity.confidence ?? 0) >= (previous.confidence ?? 0)) {
      candidates.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: String(identity.name).trim(),
        site: identity.site || previous?.site || null,
        status: "active",
        source: identity.source || "identity import",
      });
    }
  }

  for (const record of sourceRecords) {
    const trid = normalizeTrid(record.id ?? record.trid);
    if (!isValidTrid(trid)) continue;

    const current = candidates.get(trid);

    if (!current) {
      candidates.set(trid, {
        organization_id: organizationId,
        trid,
        full_name: isUsablePersonName(record.name)
          ? record.name
          : "Unresolved driver",
        site:
          record.site && record.site !== "Unknown"
            ? record.site
            : null,
        status: "active",
        source: "metric source",
      });
    } else if (
      (!current.site || current.site === "Unknown") &&
      record.site &&
      record.site !== "Unknown"
    ) {
      current.site = record.site;
    }
  }

  if (!candidates.size) return;

  const rows = [...candidates.values()].map(({ source, ...row }) => row);

  const { data: saved, error } = await supabase
    .from("drivers")
    .upsert(rows, { onConflict: "organization_id,trid" })
    .select("id,trid,full_name,site");

  if (error) throw error;

  const identityByTrid = new Map();

  for (const sourceRecord of sourceRecords) {
    const trid = normalizeTrid(sourceRecord.id ?? sourceRecord.trid);

    if (!isValidTrid(trid) || !isUsablePersonName(sourceRecord.name)) {
      continue;
    }

    identityByTrid.set(trid, {
      trid,
      name: String(sourceRecord.name).trim(),
      site:
        sourceRecord.site && sourceRecord.site !== "Unknown"
          ? sourceRecord.site
          : null,
      source: sourceRecord.sources?.[0] || "operational report",
      confidence: 0.96,
    });
  }

  for (const identity of identityRecords) {
    const trid = normalizeTrid(identity.trid);

    if (!isValidTrid(trid) || !isUsablePersonName(identity.name)) {
      continue;
    }

    identityByTrid.set(trid, identity);
  }

  const nameCounts = new Map();

  for (const identity of identityByTrid.values()) {
    const normalized = normalizeName(identity.name);
    const signature = nameSignature(identity.name);

    nameCounts.set(
      `N:${normalized}`,
      (nameCounts.get(`N:${normalized}`) || 0) + 1
    );
    nameCounts.set(
      `S:${signature}`,
      (nameCounts.get(`S:${signature}`) || 0) + 1
    );
  }

  const aliasRows = [];

  for (const driver of saved || []) {
    const identity = identityByTrid.get(normalizeTrid(driver.trid));

    aliasRows.push({
      organization_id: organizationId,
      driver_id: driver.id,
      alias_type: "trid",
      alias_value: driver.trid,
      alias_normalized: normalizeTrid(driver.trid),
      confidence: 1,
      source: identity?.source || "driver record",
    });

    if (identity && isUsablePersonName(identity.name)) {
      const normalized = normalizeName(identity.name);
      const signature = nameSignature(identity.name);

      if (nameCounts.get(`N:${normalized}`) === 1) {
        aliasRows.push({
          organization_id: organizationId,
          driver_id: driver.id,
          alias_type: "name",
          alias_value: identity.name,
          alias_normalized: normalized,
          confidence: 1,
          source: identity.source || "identity master",
        });
      }

      if (nameCounts.get(`S:${signature}`) === 1) {
        aliasRows.push({
          organization_id: organizationId,
          driver_id: driver.id,
          alias_type: "mentor_name",
          alias_value: identity.name,
          alias_normalized: signature,
          confidence: 0.99,
          source: identity.source || "identity master",
        });
      }
    }
  }

  if (aliasRows.length) {
    const { error: aliasError } = await supabase
      .from("driver_aliases")
      .upsert(aliasRows, {
        onConflict: "organization_id,alias_type,alias_normalized",
      });

    if (aliasError) throw aliasError;
  }
}

export async function storeUnmatched(supabase, organizationId, rows) {
  if (!rows.length) return 0;

  const { data, error } = await supabase
    .from("unmatched_driver_records")
    .insert(rows)
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}
