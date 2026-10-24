import type { AttributeMark } from '@apparel-os/schemas';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import {
  SYNTHETIC_PT_LAYOUT,
  SYNTHETIC_PT_LAYOUT_CODE,
  SYNTHETIC_PT_MAPPING,
  SYNTHETIC_PT_MAPPING_CODE,
} from '../fixtures/pt.js';
import { writeSyntheticLayout } from './imports.js';
import { writeSyntheticItemMap, writeSyntheticMarking } from './marked-attributes.js';
import { decided, type StructureSetup } from './organisation.js';

// The SYNTHETIC world of a PT upload (goods-in 5.2, 5.5; S2-F04-T02), made through the catalogue's real commands
// where a person would make it (code-house-rules 11.2): a SYNTHETIC replica of the master sheet's lists, each an
// attribute whose values a different person confirmed, marked as the Organisation's season, colour, gender, type,
// item, fit and GST rate attributes (the size list is the receiving world's); the Sub category list as categories; the
// master sheet's item map, kept with the item marking (RR-583): TSHIRT is a CASUAL TOP, and SHORTS has no entry; and
// the PT template's layout and mapping, Confirmed by a different person. Markings, the map and the layout are written as
// fixtures, as the receiving world writes its size marking, since their own routes are proved elsewhere
// (season-and-size-attributes.int.test.ts; imports-review.int.test.ts) and the map has none yet. Nothing here is KDPS's.

function ok<A>(
  outcome:
    | { kind: 'success'; answer: A }
    | { kind: 'refusal'; refusal: { readonly code: string; readonly missing: readonly unknown[] } },
): A {
  if (outcome.kind !== 'success') {
    throw new Error(`Refused: ${outcome.refusal.code} ${JSON.stringify(outcome.refusal.missing)}`);
  }
  return outcome.answer;
}

/** A list of the template: its attribute and its values by code. */
export interface SyntheticList {
  readonly attributeId: string;
  readonly values: Readonly<Record<string, { readonly id: string; readonly code: string }>>;
}

export interface PtWorld {
  readonly season: SyntheticList;
  readonly colour: SyntheticList;
  readonly gender: SyntheticList;
  readonly type: SyntheticList;
  readonly item: SyntheticList;
  readonly fit: SyntheticList;
  readonly gstRate: SyntheticList;
  /** The Sub category list, as categories (structure-and-masters 4.2). */
  readonly categories: Readonly<Record<string, { readonly id: string; readonly code: string }>>;
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
}

/**
 * The lists, their markings, the categories and the PT template's layout. `label` keeps each world's codes apart;
 * `names` are each list's value names, turned into SYNTHETIC codes. With `sizes`, each category has a size set of them
 * in force from the setup's today, as a PT's approval needs (goods-in 6.3; S2-F06-T01): a size set is fixed to its
 * category, which names it by a later version (structure-and-masters 4.1), so the categories and their size sets are
 * recorded on the setup's clock a day earlier, naming no identity, and each category's version from today names its
 * size set and the colour list as its identity, as the products journey's category does (test/browser/serve.ts).
 */
export async function ptWorld(
  setup: StructureSetup,
  database: string,
  label: string,
  people: { readonly proposer: string; readonly confirmer: string },
  choices: { readonly sizes?: readonly string[] } = {},
): Promise<PtWorld> {
  const today = setup.today();
  const value = async (attributeId: string, code: string) => {
    const proposed = ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, { attributeId, code, name: syntheticName(code) }),
      ),
    );
    decided(await setup.decide(proposed.requestId, proposed.proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
    if (confirmed?.valueId === undefined) throw new Error(`${code} was not confirmed`);
    return { id: confirmed.valueId, code };
  };
  // The attribute marked already, as another journey's season may be, takes the values; otherwise a new list attribute,
  // which is then marked (as receivingFixture does with the size list). The marking's version in force is kept.
  const markings: Partial<Record<AttributeMark, string>> = {};
  const list = async (mark: AttributeMark, names: readonly string[]): Promise<SyntheticList> => {
    const marked = await setup.run(setup.preparer.id, (c) => setup.catalogue.markedAttributeAt(c, mark));
    const attributeId =
      marked.kind === 'set'
        ? marked.attributeId
        : ok(
            await setup.asPreparerDo((c, p) =>
              setup.catalogue.prepareAttribute(c, p, {
                code: syntheticCode(`${label}-${mark.toUpperCase()}`),
                valueKind: 'list',
                name: syntheticName(`${label} ${mark}`),
                validFrom: today,
              }),
            ),
          ).recordId;
    const values: Record<string, { id: string; code: string }> = {};
    for (const name of names) values[name] = await value(attributeId, syntheticCode(`${label}-${name}`));
    markings[mark] =
      marked.kind === 'set'
        ? marked.versionId
        : await writeSyntheticMarking(database, mark, attributeId, setup.preparer.id);
    return { attributeId, values };
  };
  const season = await list('season', ['SPRING']);
  // The grade tags of the colour list (DEC-138) beside a colour.
  const colour = await list('colour', ['NAVY', 'PREMIUM']);
  const gender = await list('gender', ['MALE', 'KIDS']);
  const type = await list('type', ['TOP', 'BOTTOM']);
  const item = await list('item', ['TSHIRT', 'SHORTS']);
  const fit = await list('fit', ['SLIM']);
  const gstRate = await list('gst-rate', ['GST-5', 'GST-18']);
  const categories: Record<string, { id: string; code: string }> = {};
  const { sizes } = choices;
  if (sizes !== undefined) setup.advanceDays(-1);
  const sizeSets: { categoryId: string; versionId: string; name: string; sizeSetId: string }[] = [];
  for (const name of ['CASUAL', 'FORMAL']) {
    const code = syntheticCode(`${label}-${name}`);
    const categoryName = syntheticName(`${label} ${name.toLowerCase()}`);
    const made = ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategory(c, p, {
          code,
          name: categoryName,
          identityAttributeIds: sizes === undefined ? [colour.attributeId] : [],
          validFrom: setup.today(),
        }),
      ),
    );
    categories[name] = { id: made.recordId, code };
    if (sizes !== undefined) {
      const sizeSet = ok(
        await setup.asPreparerDo((c, p) =>
          setup.catalogue.prepareSizeSet(c, p, {
            code: syntheticCode(`${label}-${name}-SIZES`),
            categoryId: made.recordId,
            name: syntheticName(`${label} ${name.toLowerCase()} sizes`),
            sizes: [...sizes],
            validFrom: setup.today(),
          }),
        ),
      );
      sizeSets.push({
        categoryId: made.recordId,
        versionId: made.versionId,
        name: categoryName,
        sizeSetId: sizeSet.recordId,
      });
    }
  }
  if (sizes !== undefined) setup.advanceDays(1);
  for (const each of sizeSets) {
    ok(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareCategoryVersion(c, p, each.categoryId, {
          name: each.name,
          sizeSetId: each.sizeSetId,
          identityAttributeIds: [colour.attributeId],
          validFrom: setup.today(),
          versionToken: each.versionId,
        }),
      ),
    );
  }
  const itemMarking = markings.item;
  const tshirt = item.values.TSHIRT?.id;
  const casual = categories.CASUAL?.id;
  const top = type.values.TOP?.id;
  if (itemMarking === undefined || tshirt === undefined || casual === undefined || top === undefined) {
    throw new Error('The SYNTHETIC item map lost a value');
  }
  await writeSyntheticItemMap(database, itemMarking, [{ itemValueId: tshirt, categoryId: casual, typeValueId: top }]);
  const layout = await writeSyntheticLayout(
    database,
    {
      layoutCode: `${SYNTHETIC_PT_LAYOUT_CODE}-${label}`,
      mappingCode: `${SYNTHETIC_PT_MAPPING_CODE}-${label}`,
      structure: SYNTHETIC_PT_LAYOUT,
      fields: SYNTHETIC_PT_MAPPING,
      target: 'merchandise.pt',
      kinds: ['transaction'],
      documentType: 'pt',
    },
    people.proposer,
    people.confirmer,
  );
  return {
    season,
    colour,
    gender,
    type,
    item,
    fit,
    gstRate,
    categories,
    layoutVersionId: layout.layoutVersionId,
    mappingVersionId: layout.mappingVersionId,
  };
}
