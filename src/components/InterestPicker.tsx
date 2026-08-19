import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { INTEREST_CATEGORIES, INTEREST_SELECTION_LIMIT, catalogLabelKey, categoryLabelKey, interestsInCategory, type InterestEntry } from '../lib/interestCatalog';
import { searchCatalog, toggleInterest } from '../lib/interestPicker';
import { formatCount } from '../lib/format';
import { interestLabel } from '../lib/validation';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderChip, BinderIcon, BinderText } from './ui';
import { MotionPressable as Pressable } from './ui';

type Props = {
  selection: readonly string[];
  onChange: (selection: readonly string[]) => void;
};

// The interest picker: search on top, thirteen collapsible categories below, a
// live counter on the side. While a search is active the categories yield to a
// flat result list — collapsing sections during a search would hide the very
// matches that were asked for.
//
// Only expanded categories render their chips. Three hundred chips in one
// mounted tree is exactly the kind of screen that starts dropping frames, and
// a collapsed section costs one header row.
export function InterestPicker({ selection, onChange }: Props) {
  const { theme, locale, t } = useBinderTheme();
  const [query, setQuery] = useState('');
  // Everything starts closed: thirteen headings fit on one screen, one open
  // category does not — the first one alone is forty chips, and leaving it
  // open buried the other twelve below a scroll nobody knew to make.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([] as string[]));

  const labelOf = useMemo(() => (entry: InterestEntry) => t(catalogLabelKey(entry.id)), [t]);
  const results = useMemo(() => searchCatalog(query, labelOf), [query, labelOf]);
  const searching = query.trim().length > 0;

  const toggle = (id: string) => onChange(toggleInterest(selection, id));
  const counter = t('identity.interestPicker.counter', { count: selection.length, max: INTEREST_SELECTION_LIMIT });

  const chip = (entry: InterestEntry) => (
    <BinderChip
      key={entry.id}
      emoji={entry.emoji}
      label={labelOf(entry)}
      selected={selection.includes(entry.id)}
      onPress={() => toggle(entry.id)}
    />
  );

  return (
    <View style={{ gap: theme.spacing.x4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BinderText variant="micro" tone="muted">{t('profileSettings.fields.interests')}</BinderText>
        <BinderText
          accessibilityLiveRegion="polite"
          variant="label"
          tone={selection.length >= INTEREST_SELECTION_LIMIT ? 'accent' : 'secondary'}
        >
          {counter}
        </BinderText>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, minHeight: theme.layout.controlHeight, borderRadius: theme.radii.control, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.x4 }}>
        <BinderIcon name="search" size={20} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('identity.interestPicker.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel={t('identity.interestPicker.searchPlaceholder')}
          autoCorrect={false}
          style={{ flex: 1, color: theme.colors.textPrimary, fontFamily: theme.typography.label.fontFamily }}
        />
      </View>

      {searching ? (
        results.length === 0 ? (
          <BinderText variant="caption" tone="muted">{t('identity.interestPicker.noResults')}</BinderText>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>{results.map(chip)}</View>
        )
      ) : (
        INTEREST_CATEGORIES.map((categoryId) => {
          const isOpen = expanded.has(categoryId);
          const chosenHere = interestsInCategory(categoryId).filter((entry) => selection.includes(entry.id)).length;
          const toggleCategory = () => setExpanded((current) => {
            const next = new Set(current);
            if (isOpen) next.delete(categoryId); else next.add(categoryId);
            return next;
          });
          return (
            <View key={categoryId} style={{ gap: theme.spacing.x3 }}>
              {/* The whole heading opens and closes the category, and it sits
                  ABOVE the chips on purpose: a control underneath a list that
                  collapses moves out from under the finger and leaves the
                  reader at a completely different place in the page. */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={t(categoryLabelKey(categoryId))}
                onPress={toggleCategory}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, minHeight: theme.layout.minimumTouchTarget }}
              >
                <BinderText variant="title" style={{ flex: 1 }}>{t(categoryLabelKey(categoryId))}</BinderText>
                {chosenHere > 0 ? <BinderText variant="label" tone="accent">{formatCount(chosenHere, locale)}</BinderText> : null}
                <BinderIcon name={isOpen ? 'decrease' : 'increase'} size={20} color={theme.colors.textMuted} />
              </Pressable>
              {isOpen ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
                  {interestsInCategory(categoryId).map(chip)}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* Stored values the catalogue does not know still render and stay
          removable — they came from an older list and belong to the person. */}
      {selection.filter((id) => !labelOfKnown(id)).map((id) => (
        <BinderChip key={id} label={interestLabel(t, id)} selected onPress={() => toggle(id)} />
      ))}
    </View>
  );
}

const knownIds = new Set<string>();
function labelOfKnown(id: string): boolean {
  if (knownIds.size === 0) {
    for (const category of INTEREST_CATEGORIES) for (const entry of interestsInCategory(category)) knownIds.add(entry.id);
  }
  return knownIds.has(id);
}
