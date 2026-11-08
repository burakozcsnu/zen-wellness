(function () {
    'use strict';

    const parseGroups = (exercise) => {
        if (!exercise?.gruplar) return {};
        if (typeof exercise.gruplar === 'object') return exercise.gruplar;
        try {
            return JSON.parse(exercise.gruplar);
        } catch (error) {
            console.warn('[Exercise domain] Invalid exercise metadata:', exercise.ad, error);
            return {};
        }
    };

    const normalize = (exercise) => {
        const groups = parseGroups(exercise);
        return {
            ...groups,
            bodyPart: exercise.body_part || groups.bodyPart || '',
            classification: exercise.classifications?.length
                ? exercise.classifications
                : (groups.classification || []),
            style: exercise.style || groups.style || '',
            drill: exercise.drill || groups.drill || '',
            rank: groups.rank || '',
            level: exercise.difficulty || groups.level || '',
            branch: exercise.brans || groups.branch || 'Fitness',
            muscles: groups.muscles || [],
            styles: groups.styles || [],
            equipment: groups.equipment || ''
        };
    };

    const matchesFilters = (exercise, filters) => {
        const metadata = normalize(exercise);
        const equipment = metadata.equipment.split(',').map(item => item.trim());
        return (!filters.bodyPart || metadata.bodyPart === filters.bodyPart) &&
            (!filters.classification || metadata.classification.includes(filters.classification)) &&
            (!filters.muscle || metadata.muscles.includes(filters.muscle)) &&
            (!filters.branch || metadata.branch === filters.branch) &&
            (!filters.yogaStyle || metadata.styles.includes(filters.yogaStyle)) &&
            (!filters.karateDrill || metadata.drill === filters.karateDrill) &&
            (!filters.karateRank || metadata.rank === filters.karateRank) &&
            (!filters.karateStyle || metadata.style === filters.karateStyle) &&
            (!filters.equipment || equipment.includes(filters.equipment));
    };

    window.TrainerProExerciseDomain = { normalize, matchesFilters };
})();
