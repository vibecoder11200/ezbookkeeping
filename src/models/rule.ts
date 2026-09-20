import { NormalizedText } from '@/core/text.ts';
import { TransactionType } from '@/core/transaction.ts';
import {
    type ImportTransactionReplaceRuleConditionValue,
    type ImportTransactionReplaceRuleTargetValue,
    ImportTransactionReplaceRuleConditionFieldType,
    ImportTransactionReplaceRuleConditionField,
    ImportTransactionReplaceRuleConditionOperatorType,
    ImportTransactionReplaceRuleConditionOperator,
    ImportTransactionReplaceRuleActionType,
    ImportTransactionReplaceRuleAction,
    TEXT_CONDITION_FIELDS,
    AMOUNT_CONDITION_FIELDS,
    ITEM_CONDITION_FIELDS,
    TEXT_CONDITION_OPERATORS,
    AMOUNT_CONDITION_OPERATORS
} from '@/core/rule.ts';

import type { Account } from '@/models/account.ts';
import type { TransactionCategory } from '@/models/transaction_category.ts';
import type { TransactionTag } from '@/models/transaction_tag.ts';
import type { ImportTransaction } from '@/models/imported_transaction.ts';

export interface ImportTransactionReplaceRuleMatchData {
    readonly type: TransactionType;
    readonly originalCategoryName: string;
    readonly originalSourceAccountName: string;
    readonly originalDestinationAccountName: string;
    readonly sourceAmount: number;
    readonly destinationAmount: number;
    readonly originalTagNames: string[];
    readonly description: NormalizedText;
}

export interface ImportTransactionReplaceRuleContext {
    readonly allCategoriesMap: Record<string, TransactionCategory>;
    readonly allSecondaryCategoriesMapByName: Record<number, Record<string, TransactionCategory>>;
    readonly allAccountsMap: Record<string, Account>;
    readonly allAccountsMapByName: Record<string, Account>;
    readonly allTagsMap: Record<string, TransactionTag>;
    readonly updateTransaction: (transaction: ImportTransaction) => void;
}

export interface ImportTransactionReplaceRuleApplyResult {
    readonly matchedTransactionCount: number;
    readonly updatedTransactionCount: number;
}
export class ImportTransactionReplaceRule {
    public id: string;
    public name: string;
    public conditionField: ImportTransactionReplaceRuleConditionFieldType;
    public conditionOperator: ImportTransactionReplaceRuleConditionOperatorType;
    public conditionValue: ImportTransactionReplaceRuleConditionValue;
    public actionType: ImportTransactionReplaceRuleActionType;
    public targetValue: ImportTransactionReplaceRuleTargetValue;

    private constructor(id: string, name: string, conditionField: ImportTransactionReplaceRuleConditionFieldType, conditionOperator: ImportTransactionReplaceRuleConditionOperatorType, conditionValue: ImportTransactionReplaceRuleConditionValue, actionType: ImportTransactionReplaceRuleActionType, targetValue: ImportTransactionReplaceRuleTargetValue) {
        this.id = id;
        this.name = name;
        this.conditionField = conditionField;
        this.conditionOperator = conditionOperator;
        this.conditionValue = conditionValue;
        this.actionType = actionType;
        this.targetValue = targetValue;
    }

    public isValid(): boolean {
        return ImportTransactionReplaceRule.isConditionValid(this.conditionField, this.conditionOperator, this.conditionValue, true)
            && ImportTransactionReplaceRule.isActionValid(this.conditionField, this.actionType, this.targetValue, true);
    }

    public clone(newId: string): ImportTransactionReplaceRule {
        const conditionValue = Array.isArray(this.conditionValue) ? [this.conditionValue[0], this.conditionValue[1]] as [number, number] : this.conditionValue;
        return new ImportTransactionReplaceRule(newId, this.name, this.conditionField, this.conditionOperator, conditionValue, this.actionType, this.targetValue);
    }

    public equals(other: ImportTransactionReplaceRule, checkId: boolean): boolean {
        return (!checkId || this.id === other.id)
            && this.name === other.name
            && this.conditionField === other.conditionField
            && this.conditionOperator === other.conditionOperator
            && JSON.stringify(this.conditionValue) === JSON.stringify(other.conditionValue)
            && this.actionType === other.actionType
            && this.targetValue === other.targetValue;
    }

    public toJsonObject(): unknown {
        let conditionValue = this.conditionValue;

        if (Array.isArray(conditionValue)
            && this.conditionOperator !== ImportTransactionReplaceRuleConditionOperatorType.Between
            && this.conditionOperator !== ImportTransactionReplaceRuleConditionOperatorType.NotBetween) {
            conditionValue = [conditionValue[0], conditionValue[0]];
        }

        return {
            id: this.id,
            name: this.name,
            conditionField: this.conditionField,
            conditionOperator: this.conditionOperator,
            conditionValue: conditionValue,
            actionType: this.actionType,
            targetValue: this.targetValue
        };
    }

    public static of(id: string, name: string, conditionField: ImportTransactionReplaceRuleConditionFieldType, conditionOperator: ImportTransactionReplaceRuleConditionOperatorType, conditionValue: ImportTransactionReplaceRuleConditionValue, actionType: ImportTransactionReplaceRuleActionType, targetValue: ImportTransactionReplaceRuleTargetValue): ImportTransactionReplaceRule {
        return new ImportTransactionReplaceRule(id, name, conditionField, conditionOperator, conditionValue, actionType, targetValue);
    }

    public static parse(data: unknown, generateId: () => string): ImportTransactionReplaceRule | null {
        if (!data || typeof data !== 'object') {
            return null;
        }

        if ('type' in data || 'sourceValue' in data || 'targetId' in data) {
            return ImportTransactionReplaceRule.parseLegacyRule(data, generateId);
        }

        if (!('id' in data) || !('name' in data) || !('conditionField' in data) || !('conditionOperator' in data) || !('conditionValue' in data) || !('actionType' in data) || !('targetValue' in data)
            || typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.conditionField !== 'string' || typeof data.conditionOperator !== 'string' || typeof data.actionType !== 'string') {
            return null;
        }

        const conditionField = data.conditionField as ImportTransactionReplaceRuleConditionFieldType;
        const conditionOperator = data.conditionOperator as ImportTransactionReplaceRuleConditionOperatorType;
        const actionType = data.actionType as ImportTransactionReplaceRuleActionType;

        if (!ImportTransactionReplaceRuleConditionField.valueOf(conditionField)
            || !ImportTransactionReplaceRuleConditionOperator.valueOf(conditionOperator)
            || !ImportTransactionReplaceRuleAction.valueOf(actionType)) {
            return null;
        }

        let conditionValue: ImportTransactionReplaceRuleConditionValue;

        if (typeof data.conditionValue === 'string') {
            conditionValue = data.conditionValue;
        } else if (Array.isArray(data.conditionValue) && data.conditionValue.length === 2 && typeof data.conditionValue[0] === 'number' && typeof data.conditionValue[1] === 'number') {
            conditionValue = [data.conditionValue[0], data.conditionValue[1]];
        } else {
            return null;
        }

        let targetValue: ImportTransactionReplaceRuleTargetValue;

        if (typeof data.targetValue === 'string' || typeof data.targetValue === 'number') {
            targetValue = data.targetValue;
        } else {
            return null;
        }

        if (!ImportTransactionReplaceRule.isConditionValid(conditionField, conditionOperator, conditionValue, false) || !ImportTransactionReplaceRule.isActionValid(conditionField, actionType, targetValue, false)) {
            return null;
        }

        return new ImportTransactionReplaceRule(data.id || generateId(), data.name, conditionField, conditionOperator, conditionValue, actionType, targetValue);
    }

    private static parseLegacyRule(data: object, generateId: () => string): ImportTransactionReplaceRule | null {
        if (!('type' in data) || !('sourceValue' in data) || !('targetId' in data)
            || typeof data.type !== 'string' || typeof data.sourceValue !== 'string' || typeof data.targetId !== 'string') {
            return null;
        }

        let conditionField: ImportTransactionReplaceRuleConditionFieldType;
        let operator: ImportTransactionReplaceRuleConditionOperatorType = ImportTransactionReplaceRuleConditionOperatorType.Is;
        let actionType: ImportTransactionReplaceRuleActionType;

        if (data.type === 'expenseCategory') {
            conditionField = ImportTransactionReplaceRuleConditionFieldType.ExpenseCategory;
            actionType = ImportTransactionReplaceRuleActionType.SetExpenseCategory;
        } else if (data.type === 'incomeCategory') {
            conditionField = ImportTransactionReplaceRuleConditionFieldType.IncomeCategory;
            actionType = ImportTransactionReplaceRuleActionType.SetIncomeCategory;
        } else if (data.type === 'transferCategory') {
            conditionField = ImportTransactionReplaceRuleConditionFieldType.TransferCategory;
            actionType = ImportTransactionReplaceRuleActionType.SetTransferCategory;
        } else if (data.type === 'account') {
            conditionField = ImportTransactionReplaceRuleConditionFieldType.SourceAccount;
            actionType = ImportTransactionReplaceRuleActionType.SetSourceAccount;
        } else if (data.type === 'tag') {
            conditionField = ImportTransactionReplaceRuleConditionFieldType.Tag;
            operator = ImportTransactionReplaceRuleConditionOperatorType.Contains;
            actionType = ImportTransactionReplaceRuleActionType.ReplaceTag;
        } else {
            return null;
        }

        return new ImportTransactionReplaceRule(generateId(), '', conditionField, operator, data.sourceValue, actionType, data.targetId);
    }

    private static isConditionValid(field: ImportTransactionReplaceRuleConditionFieldType, operator: ImportTransactionReplaceRuleConditionOperatorType, value: ImportTransactionReplaceRuleConditionValue, checkValueHasContent: boolean): boolean {
        if (TEXT_CONDITION_FIELDS[field]) {
            return !!TEXT_CONDITION_OPERATORS[operator] && typeof value === 'string' && (operator === ImportTransactionReplaceRuleConditionOperatorType.IsEmpty || operator === ImportTransactionReplaceRuleConditionOperatorType.IsNotEmpty || (!checkValueHasContent || value.length > 0));
        } else if (AMOUNT_CONDITION_FIELDS[field]) {
            return !!AMOUNT_CONDITION_OPERATORS[operator] && Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
        } else if (field === ImportTransactionReplaceRuleConditionFieldType.Tag) {
            return operator === ImportTransactionReplaceRuleConditionOperatorType.Contains && typeof value === 'string' && (!checkValueHasContent || value.length > 0);
        } else if (ITEM_CONDITION_FIELDS[field]) {
            return operator === ImportTransactionReplaceRuleConditionOperatorType.Is && typeof value === 'string' && (!checkValueHasContent || value.length > 0);
        }

        return false;
    }

    private static isActionValid(conditionField: ImportTransactionReplaceRuleConditionFieldType, actionType: ImportTransactionReplaceRuleActionType, targetValue: ImportTransactionReplaceRuleTargetValue, checkValueHasContent: boolean): boolean {
        if (actionType === ImportTransactionReplaceRuleActionType.SetExpenseCategory) {
            if (conditionField === ImportTransactionReplaceRuleConditionFieldType.IncomeCategory || conditionField === ImportTransactionReplaceRuleConditionFieldType.TransferCategory) {
                return false;
            }
        } else if (actionType === ImportTransactionReplaceRuleActionType.SetIncomeCategory) {
            if (conditionField === ImportTransactionReplaceRuleConditionFieldType.ExpenseCategory || conditionField === ImportTransactionReplaceRuleConditionFieldType.TransferCategory) {
                return false;
            }
        } else if (actionType === ImportTransactionReplaceRuleActionType.SetTransferCategory) {
            if (conditionField === ImportTransactionReplaceRuleConditionFieldType.ExpenseCategory || conditionField === ImportTransactionReplaceRuleConditionFieldType.IncomeCategory) {
                return false;
            }
        } else if (actionType === ImportTransactionReplaceRuleActionType.ReplaceTag || actionType === ImportTransactionReplaceRuleActionType.DeleteTag) {
            if (conditionField !== ImportTransactionReplaceRuleConditionFieldType.Tag) {
                return false;
            }
        }

        if (actionType === ImportTransactionReplaceRuleActionType.SetTransactionType) {
            return targetValue === TransactionType.Income || targetValue === TransactionType.Expense || targetValue === TransactionType.Transfer;
        } else if (actionType === ImportTransactionReplaceRuleActionType.SetSourceAmount || actionType === ImportTransactionReplaceRuleActionType.SetDestinationAmount) {
            return targetValue === 1 || targetValue === -1;
        } else if (actionType === ImportTransactionReplaceRuleActionType.DeleteTag) {
            return targetValue === '';
        }

        return typeof targetValue === 'string' && (!checkValueHasContent || targetValue.length > 0);
    }
}

export class ImportTransactionReplaceRules {
    private static readonly JSON_ROOT_FIELD = 'ezBookkeepingImportTransactionReplaceRules';

    private readonly rules: ImportTransactionReplaceRule[];

    private constructor(rules: ImportTransactionReplaceRule[]) {
        this.rules = rules;
    }

    public getRules(): ImportTransactionReplaceRule[] {
        return this.rules;
    }

    public toJson(): string {
        const result: unknown[] = [];

        for (const rule of this.rules) {
            result.push(rule.toJsonObject());
        }

        return JSON.stringify({
            [ImportTransactionReplaceRules.JSON_ROOT_FIELD]: result
        });
    }

    public static of(rules: ImportTransactionReplaceRule[]): ImportTransactionReplaceRules {
        return new ImportTransactionReplaceRules(rules);
    }

    public static parseFromJson(json: string, generateId: () => string): ImportTransactionReplaceRules | null {
        try {
            const parsed = JSON.parse(json);
            const root = parsed[ImportTransactionReplaceRules.JSON_ROOT_FIELD];

            if (!Array.isArray(root)) {
                return null;
            }

            const result = new ImportTransactionReplaceRules([]);

            for (const rule of root) {
                const parsedRule = ImportTransactionReplaceRule.parse(rule, generateId);

                if (!parsedRule) {
                    return null;
                }

                result.rules.push(parsedRule);
            }

            return result;
        } catch {
            return null;
        }
    }
}
// [PLUGIN:rules] Rules engine feature - TypeScript models.
// Mirrors the backend DTOs in pkg/models/rule*.go.

export type RuleTriggerType =
    | 'description_is'
    | 'description_contains'
    | 'amount_is'
    | 'amount_less'
    | 'amount_more'
    | 'source_account_is'
    | 'destination_account_is'
    | 'category_is'
    | 'has_no_category'
    | 'has_any_category';

export type RuleActionType =
    | 'set_category'
    | 'clear_category'
    | 'add_tag'
    | 'remove_tag'
    | 'remove_all_tags'
    | 'set_description'
    | 'append_to_description'
    | 'prepend_to_description'
    | 'set_amount'
    | 'set_source_account';

export interface RuleTriggerInfoResponse {
    readonly id: string;
    readonly triggerType: RuleTriggerType;
    readonly triggerValue: string;
    readonly displayOrder: number;
    readonly prohibited: boolean;
    readonly stopProcessing: boolean;
}

export interface RuleActionInfoResponse {
    readonly id: string;
    readonly actionType: RuleActionType;
    readonly actionValue: string;
    readonly displayOrder: number;
    readonly stopProcessing: boolean;
}

export interface RuleInfoResponse {
    readonly id: string;
    readonly ruleGroupId: string;
    readonly name: string;
    readonly comment: string;
    readonly displayOrder: number;
    readonly active: boolean;
    readonly strict: boolean;
    readonly stopProcessing: boolean;
    readonly applyOnCreate: boolean;
    readonly applyOnUpdate: boolean;
    readonly triggers: RuleTriggerInfoResponse[];
    readonly actions: RuleActionInfoResponse[];
}

export interface RuleGroupInfoResponse {
    readonly id: string;
    readonly name: string;
    readonly comment: string;
    readonly displayOrder: number;
    readonly active: boolean;
    readonly stopProcessing: boolean;
}

// --- Editable model classes (used by the editor UI) ---

export class RuleTrigger implements RuleTriggerInfoResponse {
    public id: string;
    public triggerType: RuleTriggerType;
    public triggerValue: string;
    public displayOrder: number;
    public prohibited: boolean;
    public stopProcessing: boolean;

    public constructor(triggerType: RuleTriggerType = 'description_contains', triggerValue: string = '') {
        this.id = '';
        this.triggerType = triggerType;
        this.triggerValue = triggerValue;
        this.displayOrder = 0;
        this.prohibited = false;
        this.stopProcessing = false;
    }

    public static of(resp: RuleTriggerInfoResponse): RuleTrigger {
        const t = new RuleTrigger(resp.triggerType, resp.triggerValue);
        t.id = resp.id;
        t.displayOrder = resp.displayOrder;
        t.prohibited = resp.prohibited;
        t.stopProcessing = resp.stopProcessing;
        return t;
    }
}

export class RuleAction implements RuleActionInfoResponse {
    public id: string;
    public actionType: RuleActionType;
    public actionValue: string;
    public displayOrder: number;
    public stopProcessing: boolean;

    public constructor(actionType: RuleActionType = 'set_category', actionValue: string = '') {
        this.id = '';
        this.actionType = actionType;
        this.actionValue = actionValue;
        this.displayOrder = 0;
        this.stopProcessing = false;
    }

    public static of(resp: RuleActionInfoResponse): RuleAction {
        const a = new RuleAction(resp.actionType, resp.actionValue);
        a.id = resp.id;
        a.displayOrder = resp.displayOrder;
        a.stopProcessing = resp.stopProcessing;
        return a;
    }
}

export class Rule implements RuleInfoResponse {
    public id: string;
    public ruleGroupId: string;
    public name: string;
    public comment: string;
    public displayOrder: number;
    public active: boolean;
    public strict: boolean;
    public stopProcessing: boolean;
    public applyOnCreate: boolean;
    public applyOnUpdate: boolean;
    public triggers: RuleTrigger[];
    public actions: RuleAction[];

    public constructor() {
        this.id = '';
        this.ruleGroupId = '';
        this.name = '';
        this.comment = '';
        this.displayOrder = 0;
        this.active = true;
        this.strict = false; // ANY by default (more intuitive for users)
        this.stopProcessing = false;
        this.applyOnCreate = true;
        this.applyOnUpdate = false;
        this.triggers = [new RuleTrigger()];
        this.actions = [new RuleAction()];
    }

    public static of(resp: RuleInfoResponse): Rule {
        const r = new Rule();
        r.id = resp.id;
        r.ruleGroupId = resp.ruleGroupId;
        r.name = resp.name;
        r.comment = resp.comment;
        r.displayOrder = resp.displayOrder;
        r.active = resp.active;
        r.strict = resp.strict;
        r.stopProcessing = resp.stopProcessing;
        r.applyOnCreate = resp.applyOnCreate;
        r.applyOnUpdate = resp.applyOnUpdate;
        r.triggers = (resp.triggers || []).map(RuleTrigger.of);
        r.actions = (resp.actions || []).map(RuleAction.of);
        return r;
    }

    public toCreateRequest(clientSessionId: string): RuleCreateRequest {
        return {
            ruleGroupId: this.ruleGroupId,
            name: this.name,
            comment: this.comment,
            active: this.active,
            strict: this.strict,
            stopProcessing: this.stopProcessing,
            applyOnCreate: this.applyOnCreate,
            applyOnUpdate: this.applyOnUpdate,
            triggers: this.triggers.map(t => ({
                triggerType: t.triggerType,
                triggerValue: t.triggerValue,
                prohibited: t.prohibited,
                stopProcessing: t.stopProcessing
            })),
            actions: this.actions.map(a => ({
                actionType: a.actionType,
                actionValue: a.actionValue,
                stopProcessing: a.stopProcessing
            })),
            clientSessionId
        };
    }

    public toModifyRequest(): RuleModifyRequest {
        return {
            id: this.id,
            ruleGroupId: this.ruleGroupId,
            name: this.name,
            comment: this.comment,
            active: this.active,
            strict: this.strict,
            stopProcessing: this.stopProcessing,
            applyOnCreate: this.applyOnCreate,
            applyOnUpdate: this.applyOnUpdate,
            triggers: this.triggers.map(t => ({
                triggerType: t.triggerType,
                triggerValue: t.triggerValue,
                prohibited: t.prohibited,
                stopProcessing: t.stopProcessing
            })),
            actions: this.actions.map(a => ({
                actionType: a.actionType,
                actionValue: a.actionValue,
                stopProcessing: a.stopProcessing
            }))
        };
    }
}

export class RuleGroup implements RuleGroupInfoResponse {
    public id: string;
    public name: string;
    public comment: string;
    public displayOrder: number;
    public active: boolean;
    public stopProcessing: boolean;

    public constructor() {
        this.id = '';
        this.name = '';
        this.comment = '';
        this.displayOrder = 0;
        this.active = true;
        this.stopProcessing = false;
    }

    public static of(resp: RuleGroupInfoResponse): RuleGroup {
        const g = new RuleGroup();
        g.id = resp.id;
        g.name = resp.name;
        g.comment = resp.comment;
        g.displayOrder = resp.displayOrder;
        g.active = resp.active;
        g.stopProcessing = resp.stopProcessing;
        return g;
    }

    public toCreateRequest(clientSessionId: string): RuleGroupCreateRequest {
        return {
            name: this.name,
            comment: this.comment,
            active: this.active,
            stopProcessing: this.stopProcessing,
            clientSessionId
        };
    }

    public toModifyRequest(): RuleGroupModifyRequest {
        return {
            id: this.id,
            name: this.name,
            comment: this.comment,
            active: this.active,
            stopProcessing: this.stopProcessing
        };
    }
}

// --- Request interfaces ---

export interface RuleTriggerInput {
    readonly triggerType: RuleTriggerType;
    readonly triggerValue: string;
    readonly prohibited: boolean;
    readonly stopProcessing: boolean;
}

export interface RuleActionInput {
    readonly actionType: RuleActionType;
    readonly actionValue: string;
    readonly stopProcessing: boolean;
}

export interface RuleCreateRequest {
    readonly ruleGroupId: string;
    readonly name: string;
    readonly comment: string;
    readonly active: boolean;
    readonly strict: boolean;
    readonly stopProcessing: boolean;
    readonly applyOnCreate: boolean;
    readonly applyOnUpdate: boolean;
    readonly triggers: RuleTriggerInput[];
    readonly actions: RuleActionInput[];
    readonly clientSessionId: string;
}

export interface RuleModifyRequest {
    readonly id: string;
    readonly ruleGroupId: string;
    readonly name: string;
    readonly comment: string;
    readonly active: boolean;
    readonly strict: boolean;
    readonly stopProcessing: boolean;
    readonly applyOnCreate: boolean;
    readonly applyOnUpdate: boolean;
    readonly triggers: RuleTriggerInput[];
    readonly actions: RuleActionInput[];
}

export interface RuleGroupCreateRequest {
    readonly name: string;
    readonly comment: string;
    readonly active: boolean;
    readonly stopProcessing: boolean;
    readonly clientSessionId: string;
}

export interface RuleGroupModifyRequest {
    readonly id: string;
    readonly name: string;
    readonly comment: string;
    readonly active: boolean;
    readonly stopProcessing: boolean;
}

